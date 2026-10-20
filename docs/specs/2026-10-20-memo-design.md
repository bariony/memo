# Memo — Assistente Pessoal via WhatsApp
## Design Specification

**Data:** 2026-10-20  
**MVP Target:** 2–3 usuários iniciais  
**Escala Futuro:** Mercado geral  

---

## 1. Overview

**Memo** é um assistente pessoal via WhatsApp que combina:
- Rastreamento de gastos em linguagem natural
- Lembretes inteligentes (one-time, recorrentes, com antecedência)
- Respostas a perguntas sobre gastos históricos
- Assistente geral para dúvidas do dia a dia

Cada usuário tem **memória persistente** (histórico de gastos) e acesso é controlado por **whitelist com expiração automática** administrada centralmente.

---

## 2. Escopo MVP

**Incluído:**
- ✅ Registrar gastos por texto em linguagem natural ("gastei 50 reais no mercado")
- ✅ Lembretes: one-time ("amanhã 18h"), recorrentes ("todo dia 18h"), com antecedência ("dia 28/01 médico, 1h antes")
- ✅ Responder perguntas sobre gastos ("quanto gastei essa semana?")
- ✅ Assistente geral (dúvidas, conselhos, pesquisa)
- ✅ Whitelist com data de expiração automática
- ✅ Admin panel para gerenciar acesso
- ✅ Deploy em Railway

**Fora do MVP (futuro):**
- ❌ Fotos de recibo (OCR/Vision)
- ❌ Análise avançada de hábitos de gasto
- ❌ Categorias customizáveis por usuário
- ❌ Integração com bancos (Plaid, etc)

---

## 3. Arquitetura

### 3.1 Componentes principais

```
┌─────────────────────────────────────┐
│   WhatsApp (Evolution API)          │
└────────────────┬────────────────────┘
                 │ webhook
┌────────────────▼────────────────────────────┐
│   Express Server (Node.js + TypeScript)    │
│  • Webhook handler (recebe msgs)           │
│  • Message processor (parse + resposta)    │
│  • Admin API routes                        │
│  • Health checks                           │
└────────────────┬─────────────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
┌───▼───┐  ┌────▼────┐  ┌───────▼──────┐
│Claude │  │PostgreSQL│  │Redis + BullMQ│
│ API   │  │          │  │              │
└───────┘  └──────────┘  └──────────────┘
```

### 3.2 Stack técnico

| Camada | Tech |
|--------|------|
| **Backend** | Node.js 20+ + TypeScript |
| **Framework** | Express.js |
| **WhatsApp** | Evolution API (webhook) |
| **IA** | Claude Haiku API (parse + assistente) |
| **Banco** | PostgreSQL (dados persistentes) |
| **Cache** | Redis (whitelist cache, sessions) |
| **Job Queue** | BullMQ (reminders) |
| **Hosting** | Railway |
| **Admin UI** | Next.js ou HTML+API simples |

---

## 4. Banco de Dados

### 4.1 Schema

```sql
-- Usuários
CREATE TABLE users (
  phone_number VARCHAR(20) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Whitelist (controle de acesso)
CREATE TABLE whitelist (
  phone_number VARCHAR(20) PRIMARY KEY REFERENCES users(phone_number),
  permitted_until DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Despesas
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lembretes
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number),
  type VARCHAR(20) CHECK (type IN ('one_time', 'recurring')) DEFAULT 'one_time',
  scheduled_for TIMESTAMP NOT NULL,
  recurrence_rule TEXT, -- RRULE: "FREQ=DAILY;BYHOUR=18" ou NULL
  message TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_expenses_phone ON expenses(phone_number, created_at DESC);
CREATE INDEX idx_reminders_phone ON reminders(phone_number);
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_for);
CREATE INDEX idx_whitelist_status ON whitelist(status);
```

### 4.2 Migrations

Estrutura de pastas:
```
migrations/
  ├── 001_initial_schema.sql
  ├── 002_add_expenses.sql
  └── 003_add_reminders.sql
```

---

## 5. Fluxo de Mensagens

### 5.1 Receber mensagem

```
1. Evolution API webhook → POST /webhook
2. Extrair: phone_number, message_text, timestamp
3. Validar whitelist:
   - Verificar Redis cache
   - Se cache expirou ou não existe: consultar PostgreSQL
   - Se não autorizado ou expirado:
     → Enviar msg "fale com administrador (11) 986683737"
     → Log e retornar
   - Se autorizado:
     → Armazenar em Redis cache com TTL 24h
     → Criar user em DB se não existe
     → Prosseguir para step 4

4. Detectar intenção da mensagem:
   → Chamar Claude Haiku para categorizar
   → Retorno: "expense_log" | "expense_query" | "general_question"

5. Processar por intenção:
   
   a) expense_log:
      - Claude parse: extrair amount + description
      - INSERT em expenses table
      - Responder: "✓ Registrado: R$50 no mercado"
   
   b) expense_query:
      - SELECT expenses onde created_at >= 7 dias atrás
      - Claude formata resposta legível
      - Responder: "Você gastou R$150 essa semana..."
   
   c) general_question:
      - Claude responde direto (sem contexto de gastos)
      - Responder normalmente

6. Enviar resposta via Evolution API
```

---

## 6. Integração Claude Haiku

### 6.1 Casos de uso

**1. Detectar intenção**
```
Prompt: "Analise essa mensagem e categorize como 'expense_log', 'expense_query' ou 'general_question'. Responda APENAS a categoria."

User message: "gastei 50 no mercado"
Response: "expense_log"
```

**2. Parse de gastos**
```
Prompt: "Extraia amount e description de: '{user_message}'. Responda em JSON: {\"amount\": X, \"description\": \"...\"}"

User message: "gastei 50 reais no mercado"
Response: {"amount": 50, "description": "mercado"}
```

**3. Formatar resposta de gastos**
```
Prompt: "O usuário perguntou: '{question}'. Aqui estão seus gastos dos últimos 7 dias: {expenses}. Responda de forma amigável em português."

Expenses: [
  {amount: 50, description: "mercado"},
  {amount: 100, description: "combustível"}
]
Response: "Você gastou R$150 essa semana com mercado (R$50) e combustível (R$100)."
```

**4. Assistente geral**
```
Prompt: "Responda à pergunta do usuário em português de forma amigável e concisa."

User message: "como fazer chocolate quente?"
Response: "Aqui vai a receita..."
```

### 6.2 Implementação

```typescript
// Interface Claude
interface ClaudeResponse {
  intent: "expense_log" | "expense_query" | "general_question";
  parsed?: { amount: number; description: string };
  response: string;
}

async function processMessage(userMessage: string): Promise<ClaudeResponse> {
  // 1. Detectar intenção
  const intent = await detectIntent(userMessage);
  
  if (intent === "expense_log") {
    const parsed = await parseExpense(userMessage);
    const response = `✓ Registrado: R$${parsed.amount} em ${parsed.description}`;
    return { intent, parsed, response };
  }
  
  if (intent === "expense_query") {
    const expenses = await getRecentExpenses(userPhone);
    const response = await formatExpenseQuery(userMessage, expenses);
    return { intent, response };
  }
  
  // general_question
  const response = await claudeApi.ask(userMessage);
  return { intent, response };
}
```

---

## 7. Sistema de Lembretes (BullMQ)

### 7.1 Arquitetura

**Redis** armazena jobs. **BullMQ** scheduler dispara quando chega a hora.

```
User: "me lembra amanhã 18h"
  ↓
Criar reminder: type='one_time', scheduled_for=2026-10-21 18:00
  ↓
BullMQ add job com delay = (scheduled_for - now)
  ↓
Worker aguarda no Redis
  ↓
Quando scheduled_for chega:
  - Enviar msg via Evolution API
  - Marcar sent=true no DB
  - Se recurring: reagendar próxima ocorrência
```

### 7.2 Tipos de lembretes

| Tipo | Exemplo | Implementation |
|------|---------|-----------------|
| **One-time** | "amanhã 18h" | `scheduled_for = 2026-10-21 18:00:00`, `recurrence_rule = null` |
| **Recurring** | "todo dia 18h" | `type = 'recurring'`, `recurrence_rule = 'FREQ=DAILY;BYHOUR=18'` |
| **Com antecedência** | "dia 28/01 médico, 1h antes" | `scheduled_for = 2026-01-28 17:00:00` (1h antes) |

### 7.3 Implementação BullMQ

```typescript
import Queue from 'bull';

const reminderQueue = new Queue('reminders', {
  redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

// Adicionar reminder
async function scheduleReminder(reminder: Reminder) {
  const delay = reminder.scheduled_for.getTime() - Date.now();
  
  await reminderQueue.add(
    'send-reminder',
    {
      reminderId: reminder.id,
      phone: reminder.phone_number,
      message: reminder.message,
      isRecurring: reminder.type === 'recurring'
    },
    { delay }
  );
}

// Worker: processa quando chega a hora
reminderQueue.process('send-reminder', async (job) => {
  const { reminderId, phone, message, isRecurring } = job.data;
  
  // Enviar mensagem
  await evolutionApi.sendMessage(phone, message);
  
  // Marcar como enviado
  await updateReminder(reminderId, { sent: true });
  
  // Se recorrente: agendar próxima
  if (isRecurring) {
    const reminder = await getReminder(reminderId);
    const nextSchedule = calculateNextOccurrence(reminder.recurrence_rule);
    await scheduleReminder({ ...reminder, scheduled_for: nextSchedule });
  }
});
```

### 7.4 Parse de lembretes (Claude)

```typescript
// Claude extrai intenção + timing
async function parseReminder(message: string) {
  const prompt = `Extraia a intenção de lembrete dessa mensagem:
  "${message}"
  
  Responda em JSON:
  {
    "message": "o que lembrar",
    "type": "one_time" | "recurring",
    "scheduled_for": "ISO timestamp",
    "recurrence_rule": "RRULE ou null"
  }`;
  
  return await claudeApi.ask(prompt);
}
```

---

## 8. Controle de Acesso (Whitelist)

### 8.1 Fluxo de validação

```
Mensagem chega (phone_number = "11986683737")

1. Verificar Redis cache:
   - Key: `whitelist:11986683737`
   - Se existe e não expirou: PERMITIR
   - Se expirou ou não existe: ir para step 2

2. Consultar PostgreSQL:
   - SELECT whitelist WHERE phone_number = "11986683737"
   - Se status='revoked': BLOQUEAR
   - Se permitted_until < TODAY: BLOQUEAR
   - Se status='active' E permitted_until >= TODAY: 
     → Armazenar em Redis cache com TTL=24h
     → PERMITIR

3. Se bloqueado:
   - Responder: "Você precisa falar com o administrador (11) 986683737"
```

### 8.2 Expiração automática

```
- Usuário autorizado até: 2026-10-20 23:59:59
- 2026-10-21 00:00:00 em diante: bloqueado
- Mensagem: "Sua licença expirou. Para não perder seu histórico, fale com Igor para renovar."
```

### 8.3 Implementação

```typescript
async function validateUserAccess(phone: string): Promise<boolean> {
  // Check Redis cache primeiro (rápido)
  const cached = await redis.get(`whitelist:${phone}`);
  if (cached === 'authorized') return true;
  
  // Consultar DB se cache miss
  const whitelist = await db.query(
    'SELECT permitted_until, status FROM whitelist WHERE phone_number = $1',
    [phone]
  );
  
  if (!whitelist || whitelist.status === 'revoked') {
    return false;
  }
  
  if (new Date(whitelist.permitted_until) < new Date()) {
    return false; // expirado
  }
  
  // Armazenar em cache por 24h
  await redis.setex(`whitelist:${phone}`, 86400, 'authorized');
  return true;
}
```

---

## 9. Admin Panel

### 9.1 Funcionalidades

- ✅ **Listar usuários:** phone_number, permitted_until, status, última msg, msgs processadas
- ✅ **Adicionar usuário:** input phone_number + data de expiração
- ✅ **Revogar acesso:** marcar status='revoked'
- ✅ **Dashboard simples:** usuários ativos, msgs processadas (essa semana, total)

### 9.2 Tech

**Opção A (simples):** HTML + API Node.js com autenticação básica  
**Opção B (mais polida):** Next.js com Tailwind  

Para MVP: **Opção A** (rápido, sem dependências extras)

### 9.3 API endpoints + Autenticação

```
POST /admin/auth 
  body: { password: "..." }
  response: { token: "jwt..." }
  (gera JWT com expiração 24h)

GET /admin/whitelist
  header: Authorization: Bearer {token}
  response: [ { phone, permitted_until, status, last_msg_at } ]

POST /admin/whitelist
  body: { phone: "11986683737", permitted_until: "2026-12-20" }
  response: { success: true }

PATCH /admin/whitelist/:phone
  body: { permitted_until: "2026-12-31" } OR { status: "revoked" }
  response: { success: true }

GET /admin/stats
  response: { active_users: 2, total_messages: 45, expenses_logged: 12 }
```

**Auth:** JWT simples. Senha do admin em env var (ADMIN_PASSWORD). Produção: considerar OAuth ou MFA.

---

## 10. Evolution API Integration

### 10.1 Webhook

```typescript
// POST /webhook
app.post('/webhook', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !data.message) return res.status(400).send('Invalid');
  
  const { phone_number, body: messageText } = data.message;
  
  // Validar whitelist
  if (!await validateUserAccess(phone_number)) {
    const reason = await checkExpirationReason(phone_number);
    const msg = reason === 'expired' 
      ? 'Sua licença expirou. Fale com Igor para renovar.'
      : 'Você precisa falar com o administrador (11) 986683737';
    
    await evolutionApi.sendMessage(phone_number, msg);
    return res.status(200).send('Unauthorized');
  }
  
  // Processar mensagem
  const response = await processMessage(messageText, phone_number);
  await evolutionApi.sendMessage(phone_number, response);
  
  res.status(200).send('OK');
});
```

### 10.2 Enviar mensagens

```typescript
async function sendMessage(phone: string, text: string) {
  try {
    const response = await axios.post(
      `https://api.evolution.br/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      {
        number: phone,
        text: text
      },
      {
        headers: {
          'apikey': process.env.EVOLUTION_API_KEY
        },
        timeout: 5000
      }
    );
    
    return response.data;
  } catch (error) {
    console.error(`Failed to send message to ${phone}:`, error);
    throw error;
  }
}
```

**Error handling:**
- Se Evolution API falhar: log de erro, retry automático via BullMQ (max 3 tentativas)
- Se falhar após retries: armazenar em `failed_messages` table para análise posterior

---

## 11. Deploy (Railway)

### 11.1 Variáveis de ambiente

```
# PostgreSQL
DATABASE_URL=postgresql://user:pass@host/memo

# Redis
REDIS_URL=redis://host:6379

# Claude API
CLAUDE_API_KEY=sk-...

# Evolution API
EVOLUTION_INSTANCE=seu_instancia
EVOLUTION_API_KEY=sua_chave

# Admin
ADMIN_PASSWORD=senha_forte_aqui

# Node
NODE_ENV=production
PORT=3000
```

### 11.2 Setup no Railway

1. Conectar GitHub repo
2. Configurar variáveis de ambiente
3. Adicionar PostgreSQL plugin
4. Adicionar Redis plugin
5. Deploy automático em push

---

## 12. Estrutura de Pastas

```
memo/
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── claude.ts
│   ├── services/
│   │   ├── message.service.ts
│   │   ├── whitelist.service.ts
│   │   ├── expense.service.ts
│   │   ├── reminder.service.ts
│   │   └── claude.service.ts
│   ├── routes/
│   │   ├── webhook.ts
│   │   └── admin.ts
│   ├── workers/
│   │   └── reminder.worker.ts
│   ├── types/
│   │   └── index.ts
│   └── main.ts (entry point)
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_expenses.sql
│   └── 003_add_reminders.sql
├── admin/
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── Dockerfile (opcional)
```

---

## 13. Métricas de Sucesso (MVP)

- ✅ 2–3 usuários conseguem registrar gastos
- ✅ Lembretes disparam na hora certa
- ✅ Perguntas sobre gastos são respondidas corretamente
- ✅ Whitelist funciona: expiração automática, admin pode revogar
- ✅ Zero erros em 7 dias de uso
- ✅ Deploy em Railway estável

---

## 14. Próximos passos (pós-MVP)

1. OCR/Vision para fotos de recibo
2. Análise de categorias automáticas
3. Relatórios de gasto (PDF mensal)
4. Integração com bancos (Plaid)
5. App mobile nativa (React Native)
6. Integração com Telegram/Discord
7. Exportar histórico (CSV/JSON)

---

**Fim da especificação**
