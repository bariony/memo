import axios from 'axios';
import { getEnv } from '../config/env.js';
import { retryWithBackoff } from '../utils/resilience.js';
import { ClaudeService, ConversationTurn } from './claude.service.js';
import { ExpenseService } from './expense.service.js';
import { ReminderService } from './reminder.service.js';
import { DataService, localRange } from './data.service.js';

const TZ = 'America/Sao_Paulo';
// Brazil has no DST since 2019, so São Paulo is a fixed UTC-3.
const TZ_OFFSET = '-03:00';
const MAX_STEPS = 6;

const WMO: Record<number, string> = {
  0: 'céu limpo', 1: 'predominantemente limpo', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'neblina', 48: 'neblina', 51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte',
  61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 80: 'pancadas fracas', 81: 'pancadas de chuva',
  82: 'pancadas fortes', 95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas com granizo',
};

const TOOLS = [
  {
    name: 'create_reminders',
    description:
      'Agenda um ou mais lembretes. Use UMA chamada com todos os horários quando o usuário pedir vários avisos (ex: evento às 13h com avisos às 12:00 e 12:45 = 2 itens, um para cada aviso; inclua também o horário do evento só se o usuário pedir). Datas em horário de São Paulo.',
    input_schema: {
      type: 'object',
      properties: {
        reminders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              datetime_local: { type: 'string', description: 'Data e hora no horário de São Paulo, formato YYYY-MM-DDTHH:mm' },
              message: { type: 'string', description: 'Texto que será enviado ao usuário na hora do aviso, ex: "Audiência hoje às 13h (daqui a 1 hora)"' },
              repeat_days: {
                type: 'array',
                items: { type: 'string', enum: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] },
                description: 'Dias da semana em que repete (ex: ["TU"] = toda terça; todos os 7 = todo dia). Omita se não repete. datetime_local deve ser a PRÓXIMA ocorrência.',
              },
            },
            required: ['datetime_local', 'message'],
          },
        },
      },
      required: ['reminders'],
    },
  },
  {
    name: 'list_reminders',
    description: 'Lista os lembretes futuros do usuário, com id. Use antes de cancelar/corrigir, ou para responder o que está agendado.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancela um lembrete pelo id (obtido em list_reminders ou create_reminders). Para corrigir data/hora: cancele o errado e crie o certo.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'log_expense',
    description: 'Registra uma despesa SOMENTE quando o usuário claramente informou um gasto com valor numérico. Escolha uma categoria curta (Mercado, Transporte, Alimentação, Moradia, Saúde, Lazer, Contas, Outros). Se disser "ontem"/outra data, passe date.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number' }, description: { type: 'string' }, category: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, se o gasto não foi hoje' },
      },
      required: ['amount', 'description'],
    },
  },
  {
    name: 'get_expenses',
    description: 'Lista despesas de um período (com id) e devolve total e subtotal por categoria JÁ CALCULADOS. Use para qualquer pergunta sobre quanto/onde gastou (hoje, semana, mês). Nunca some de cabeça.',
    input_schema: { type: 'object', properties: { from_date: { type: 'string', description: 'YYYY-MM-DD' }, to_date: { type: 'string', description: 'YYYY-MM-DD (inclusive); padrão = from_date' } }, required: ['from_date'] },
  },
  {
    name: 'update_expense',
    description: 'Corrige valor/descrição/categoria de uma despesa pelo id (de get_expenses).',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, amount: { type: 'number' }, description: { type: 'string' }, category: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'delete_expense',
    description: 'Apaga uma despesa pelo id (de get_expenses).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'save_note',
    description: 'Guarda um registro/anotação com data e hora que o usuário quer lembrar depois (ex: "saí da empresa hoje às 10h" para folha de ponto, ideias, informações). Use quando a pessoa pedir para gravar/anotar/deixar salvo ou relatar algo que parece registro pessoal.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' }, datetime_local: { type: 'string', description: 'Quando o fato ocorreu, YYYY-MM-DDTHH:mm (São Paulo). Omita para agora.' } },
      required: ['text'],
    },
  },
  {
    name: 'get_notes',
    description: 'Busca anotações salvas num período, opcionalmente filtrando por texto (ex: "saí", "entrei"). Para folha de ponto, liste por dia.',
    input_schema: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' }, query: { type: 'string' } }, required: ['from_date'] },
  },
  {
    name: 'delete_note',
    description: 'Apaga uma anotação pelo id (de get_notes).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'reset_data',
    description: 'DESTRUTIVO: apaga tudo do usuário no escopo (expenses, reminders, notes ou all) para começar do zero. Só chame com confirmed=true DEPOIS que o usuário confirmou explicitamente numa mensagem, depois de você avisar o que será apagado.',
    input_schema: { type: 'object', properties: { scope: { type: 'string', enum: ['expenses', 'reminders', 'notes', 'all'] }, confirmed: { type: 'boolean' } }, required: ['scope', 'confirmed'] },
  },
  {
    name: 'get_weather',
    description: 'Previsão do tempo atual e dos próximos dias para uma cidade (dados reais). Use sempre que perguntarem do tempo/chuva/temperatura.',
    input_schema: { type: 'object', properties: { city: { type: 'string', description: 'ex: São Paulo' } }, required: ['city'] },
  },
];

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES: Record<string, string> = { SU: 'domingo', MO: 'segunda', TU: 'terça', WE: 'quarta', TH: 'quinta', FR: 'sexta', SA: 'sábado' };

function describeRule(rule?: string | null): string {
  const days = (rule?.match(/BYDAY=([A-Z,]+)/)?.[1] || '').split(',').filter(Boolean);
  return days.length ? `toda ${days.map((d) => DAY_NAMES[d]).join(' e ')}` : 'todo dia';
}

function nowParts() {
  const now = new Date();
  const text = now.toLocaleString('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const iso = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(now).replace(' ', 'T');
  return { text, iso };
}

function fmt(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export class AgentService {
  private apiUrl = 'https://api.anthropic.com/v1/messages';
  private model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

  constructor(
    private claude = new ClaudeService(),
    private expenses = new ExpenseService(),
    private reminders = new ReminderService(),
    private data = new DataService()
  ) {}

  private async executeTool(phone: string, name: string, input: any): Promise<string> {
    try {
      switch (name) {
        case 'create_reminders': {
          const items: any[] = Array.isArray(input?.reminders) ? input.reminders : [];
          if (items.length === 0) return 'Erro: nenhum lembrete informado.';
          const parsed = items.map((r) => ({
            when: new Date(`${String(r.datetime_local).slice(0, 16)}:00${TZ_OFFSET}`),
            message: String(r.message || '').trim(),
            days: Array.isArray(r.repeat_days) ? r.repeat_days.filter((d: string) => DAY_CODES.includes(d)) : [],
          }));
          const bad = parsed.find((p) => isNaN(p.when.getTime()) || !p.message);
          if (bad) return 'Erro: data/hora inválida ou mensagem vazia. Use YYYY-MM-DDTHH:mm.';
          const past = parsed.find((p) => p.when.getTime() <= Date.now());
          if (past) return `Erro: ${fmt(past.when)} já passou. Confirme a data com o usuário.`;
          const out: string[] = [];
          for (const p of parsed) {
            // Make sure the first occurrence actually falls on a requested weekday.
            if (p.days.length && p.days.length < 7) {
              for (let i = 0; i < 7 && !p.days.includes(DAY_CODES[new Date(p.when.getTime() - 3 * 3600e3).getUTCDay()]); i++) {
                p.when = new Date(p.when.getTime() + 24 * 3600e3);
              }
            }
            const rule = p.days.length === 0 ? null : p.days.length === 7 ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${p.days.join(',')}`;
            const r = await this.reminders.scheduleReminder(phone, p.when, p.message, p.days.length > 0, rule);
            out.push(`id=${r.id} em ${fmt(p.when)}${rule ? ` (repete: ${describeRule(rule)})` : ''}: ${p.message}`);
          }
          return `Agendado com sucesso:\n${out.join('\n')}`;
        }
        case 'list_reminders': {
          const list = await this.reminders.getUpcomingReminders(phone);
          if (!list.length) return 'Nenhum lembrete futuro.';
          return list
            .map((r) => `id=${r.id} em ${fmt(new Date(r.scheduled_for))}${r.type === 'recurring' ? ` (repete: ${describeRule(r.recurrence_rule)})` : ''}: ${r.message}`)
            .join('\n');
        }
        case 'cancel_reminder': {
          const ok = await this.reminders.cancelReminder(phone, String(input?.id));
          return ok ? 'Lembrete cancelado.' : 'Erro: lembrete não encontrado.';
        }
        case 'log_expense': {
          const amount = Number(input?.amount);
          const description = String(input?.description || '').trim();
          if (!Number.isFinite(amount) || amount <= 0 || !description) return 'Erro: valor ou descrição inválidos, nada foi registrado.';
          let when: Date | undefined;
          if (input?.date) {
            const d = localRange(String(input.date));
            if (!d) return 'Erro: data inválida.';
            when = new Date(d.from.getTime() + 12 * 3600e3);
          }
          const id = await this.data.logExpense(phone, amount, description, input?.category ? String(input.category) : null, when);
          return `Registrado (id=${id}) R$${amount.toFixed(2)} em ${description}.`;
        }
        case 'get_expenses': {
          const range = localRange(String(input?.from_date), input?.to_date ? String(input.to_date) : undefined);
          if (!range) return 'Erro: datas inválidas, use YYYY-MM-DD.';
          const list = await this.data.listExpenses(phone, range);
          if (!list.length) return 'Nenhuma despesa nesse período.';
          const total = list.reduce((s, e) => s + Number(e.amount), 0);
          const byCat = new Map<string, number>();
          for (const e of list) byCat.set(e.category || 'Sem categoria', (byCat.get(e.category || 'Sem categoria') || 0) + Number(e.amount));
          const lines = list.map((e) => `id=${e.id} ${new Date(e.created_at).toLocaleDateString('pt-BR', { timeZone: TZ })} R$${Number(e.amount).toFixed(2)} ${e.description}${e.category ? ` [${e.category}]` : ''}`);
          const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: R$${v.toFixed(2)}`);
          return `${list.length} despesa(s):\n${lines.join('\n')}\nTOTAL: R$${total.toFixed(2)}\nPor categoria: ${cats.join('; ')}`;
        }
        case 'update_expense': {
          const amount = input?.amount === undefined ? undefined : Number(input.amount);
          if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return 'Erro: valor inválido.';
          const ok = await this.data.updateExpense(phone, String(input?.id), { amount, description: input?.description, category: input?.category });
          return ok ? 'Despesa atualizada.' : 'Erro: despesa não encontrada.';
        }
        case 'delete_expense':
          return (await this.data.deleteExpense(phone, String(input?.id))) ? 'Despesa apagada.' : 'Erro: despesa não encontrada.';
        case 'save_note': {
          const text = String(input?.text || '').trim();
          if (!text) return 'Erro: texto vazio.';
          let when: Date | undefined;
          if (input?.datetime_local) {
            when = new Date(`${String(input.datetime_local).slice(0, 16)}:00${TZ_OFFSET}`);
            if (isNaN(when.getTime())) return 'Erro: data/hora inválida.';
          }
          await this.data.saveNote(phone, text, when);
          return `Anotado em ${fmt(when ?? new Date())}: ${text}`;
        }
        case 'get_notes': {
          const range = localRange(String(input?.from_date), input?.to_date ? String(input.to_date) : undefined);
          if (!range) return 'Erro: datas inválidas.';
          const list = await this.data.listNotes(phone, range, input?.query ? String(input.query) : undefined);
          return list.length ? list.map((n) => `id=${n.id} ${fmt(new Date(n.occurred_at))}: ${n.text}`).join('\n') : 'Nenhuma anotação nesse período.';
        }
        case 'delete_note':
          return (await this.data.deleteNote(phone, String(input?.id))) ? 'Anotação apagada.' : 'Erro: anotação não encontrada.';
        case 'reset_data': {
          if (input?.confirmed !== true) return 'Erro: o usuário ainda não confirmou. Pergunte e só então chame com confirmed=true.';
          const counts = await this.data.reset(phone, input.scope);
          return `Apagado: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}.`;
        }
        case 'get_weather':
          return await this.getWeather(String(input?.city || 'São Paulo'));
        default:
          return `Erro: ferramenta desconhecida ${name}`;
      }
    } catch (err: any) {
      console.error(`Tool ${name} failed:`, err?.message || err);
      return `Erro ao executar ${name}: ${err?.message || 'falha desconhecida'}`;
    }
  }

  private async getWeather(city: string): Promise<string> {
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: city, count: 1, language: 'pt', country_code: 'BR' },
      timeout: 8000,
    });
    const place = geo.data?.results?.[0];
    if (!place) return `Não encontrei a cidade "${city}".`;
    const w = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: place.latitude,
        longitude: place.longitude,
        current: 'temperature_2m,apparent_temperature,weather_code',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code',
        timezone: TZ,
        forecast_days: 3,
      },
      timeout: 8000,
    });
    const c = w.data.current;
    const d = w.data.daily;
    const days = d.time.map(
      (t: string, i: number) =>
        `${t}: ${WMO[d.weather_code[i]] ?? 'tempo variável'}, ${Math.round(d.temperature_2m_min[i])}° a ${Math.round(d.temperature_2m_max[i])}°C, chance de chuva ${d.precipitation_probability_max[i]}% (${d.precipitation_sum[i]} mm)`
    );
    return `${place.name}-${place.admin1 || ''}. Agora: ${Math.round(c.temperature_2m)}°C (sensação ${Math.round(c.apparent_temperature)}°C), ${WMO[c.weather_code] ?? 'tempo variável'}.\n${days.join('\n')}`;
  }

  /**
   * Conversational agent: Claude sees the full recent conversation plus
   * tools, and decides itself whether to reply, ask, schedule, log, look up
   * weather, etc. - instead of a one-shot intent classifier per message.
   */
  async respond(
    phone: string,
    messageText: string,
    systemPrompt: string,
    history: ConversationTurn[]
  ): Promise<{ text: string; toolsUsed: string[] }> {
    const now = nowParts();
    const upcoming = await this.reminders.getUpcomingReminders(phone).catch(() => []);
    const reminderCtx = upcoming.length
      ? upcoming.slice(0, 30).map((r) => `- id=${r.id} ${fmt(new Date(r.scheduled_for))}${r.type === 'recurring' ? ` (repete: ${describeRule(r.recurrence_rule)})` : ''}: ${r.message}`).join('\n')
      : '(nenhum)';
    const profile = `

═══ O QUE VOCÊ JÁ SABE SOBRE ESTE USUÁRIO ═══
Lembretes agendados:
${reminderCtx}
(Gastos e anotações ficam no banco: consulte com get_expenses / get_notes, não dependa do histórico da conversa, que é só as últimas mensagens.)`;
    const system = `${systemPrompt}${profile}

═══ CONTEXTO DE AGORA ═══
Agora: ${now.text} (${now.iso}, horário de São Paulo, UTC-3).
Você tem ferramentas e DEVE usá-las em vez de dizer que não consegue: lembretes (criar, listar, cancelar), despesas (registrar, consultar, corrigir, apagar), anotações com data/hora (save_note/get_notes), apagar tudo para recomeçar (reset_data) e previsão do tempo.

Regras de conversa:
- Leia TODA a conversa anterior. Mensagens curtas como "27/10", "às 13h", "sim" ou correções ("errei a data") continuam o assunto anterior - nunca as trate como pedido novo isolado.
- Se o usuário corrigir um lembrete (ex: "errei, era 11/10"), entenda o que mudou, MANTENHA o resto (horário, texto, repetição), cancele o antigo e crie o novo, e responda como um amigo: "Ok, Igor! Troquei para 11/10, o horário continua 13h. Já atualizei aqui, fica tranquilo!". Confirme só o que mudou e o que ficou.
- Recorrência: "toda terça" = repeat_days ["TU"], "todo dia" = os 7 dias, "terça e quinta" = ["TU","TH"]. Na confirmação diga exatamente a recorrência criada ("toda terça às 18h"), nunca "todos os dias" se não for.
- Interprete a intenção real da pessoa, não palavras-chave. Se algo for realmente ambíguo, faça UMA pergunta curta; se der para inferir com segurança, resolva e confirme.
- Lembretes: "me lembra 1h antes" ou "às 12:00 e 12:45" significam avisos nesses horários antes do evento. Crie TODOS os avisos pedidos numa única chamada. A mensagem de cada aviso deve dizer o que é e quando (ex: "Audiência às 13h - falta 1 hora"). Se faltar data ou hora, pergunte só o que falta; se o ano não for dito, use o próximo dia futuro com aquela data.
- Valores, totais e contagens vêm SEMPRE das ferramentas (get_expenses já soma e agrupa por categoria). Para "quanto gastei no mês", chame get_expenses do dia 1 até hoje e responda total e onde gastou.
- Pedidos de gravar algo ("saí da empresa hoje às 10h, deixa gravado") = save_note com a data/hora do fato; depois pode compilar com get_notes (ex: folha de ponto do mês).
- Apagar/corrigir gasto, lembrete ou anotação: busque o id na lista, aja e diga o que mudou. Para "apagar tudo/começar do zero": diga o que será apagado, peça confirmação e só então reset_data com confirmed=true.
- Só registre despesa quando houver um gasto com valor claro. Nunca registre despesa a partir de correção, pergunta ou lembrete.
- Previsão do tempo: use get_weather. Se não souber a cidade, pergunte; se o usuário já disse a cidade/bairro na conversa, use-a. Nunca mande o usuário "olhar no Google/Climatempo".
- Depois de usar ferramentas, confirme de forma natural e curta, citando datas e horas exatas agendadas. Se uma ferramenta der erro, diga isso com clareza e não finja que deu certo.
- Texto de WhatsApp: curto, sem markdown pesado.`;

    const messages: any[] = [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: messageText },
    ];
    const toolsUsed: string[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await retryWithBackoff(
        () =>
          axios.post(
            this.apiUrl,
            { model: this.model, max_tokens: 1024, system, tools: TOOLS, messages },
            {
              headers: {
                'anthropic-version': '2023-06-01',
                'x-api-key': getEnv().CLAUDE_API_KEY,
                'content-type': 'application/json',
              },
              timeout: 30000,
            }
          ),
        2,
        500
      );

      const usage = res.data.usage;
      if (usage) {
        this.claude
          .logTokenUsage(phone, (usage.input_tokens || 0) + (usage.output_tokens || 0), 'agent')
          .catch((e) => console.error('Failed to log token usage:', e));
      }

      const content: any[] = res.data.content || [];
      const toolCalls = content.filter((b) => b.type === 'tool_use');
      if (res.data.stop_reason !== 'tool_use' || toolCalls.length === 0) {
        const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return { text: text || 'Desculpe, não consegui formular uma resposta. Pode repetir?', toolsUsed };
      }

      messages.push({ role: 'assistant', content });
      const results = [];
      for (const call of toolCalls) {
        toolsUsed.push(call.name);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: await this.executeTool(phone, call.name, call.input) });
      }
      messages.push({ role: 'user', content: results });
    }

    return { text: 'Desculpe, me enrolei aqui. Pode repetir o pedido de outro jeito?', toolsUsed };
  }
}
