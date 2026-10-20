# Backend Improvements - Production Ready

## 🚀 O que foi implementado

### 1. **Logger Estruturado** (`src/utils/logger.ts`)
Logs em **arquivo + console** com diferentes níveis:

```typescript
import { logger } from './utils/logger.js';

// INFO
logger.info('User created', 'UserService', { userId: 123 }, requestId);

// WARN
logger.warn('Low disk space', 'System', { available: '10GB' }, requestId);

// ERROR
logger.error('Database connection failed', error, 'Database', { retry: 3 }, requestId);

// DEBUG
logger.debug('Processing webhook', 'WebhookService', { payload }, requestId);
```

**Arquivo de logs**: `/logs/error-2024-01-15.log`, `warn-2024-01-15.log`, etc

---

### 2. **Validação Centralizada** (`src/utils/validator.ts`)
Usa **Zod** para validar entrada de dados:

```typescript
import { requestSchemas, validate, validateRequest } from './utils/validator.js';

// Em middleware
router.post('/whitelist', validateRequest(requestSchemas.addUser), (req, res) => {
  const user = req.validated; // Type-safe!
  // user.phone_number e user.permitted_until já validados
});

// Manual
try {
  const user = validate(requestSchemas.addUser, req.body);
  // Success
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.errors); // { phone_number: 'Invalid phone number' }
  }
}
```

**Schemas disponíveis**:
- `phoneNumber` - Valida formato (11 dígitos, DDD 11-99, 3º dígito = 9)
- `date` / `futureDate` - Valida datas
- `password` - Min 6 caracteres
- `token` - String com min 10 caracteres
- `uuid` / `numberId` - IDs

---

### 3. **Error Handling Elegante** (`src/utils/errors.ts`)
Erros estruturados com códigos e status HTTP:

```typescript
import { errors } from './utils/errors.js';

// Usar factory functions
throw errors.notFound('User', userId);
throw errors.alreadyExists('Phone', 'phone_number', phoneNumber);
throw errors.invalidCredentials('Admin password incorrect');
throw errors.rateLimitExceeded();
throw errors.quotaExceeded('Messages', 1000);

// Resposta automática:
// {
//   "success": false,
//   "error": {
//     "code": "NOT_FOUND",
//     "message": "User not found (123)",
//     "details": { "resource": "User", "id": 123 }
//   },
//   "timestamp": "2024-01-15T10:30:00.000Z",
//   "requestId": "uuid-xxx"
// }
```

**Códigos de erro**:
- `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`, `TOKEN_EXPIRED`
- `VALIDATION_ERROR`, `INVALID_INPUT`
- `NOT_FOUND`, `ALREADY_EXISTS`, `CONFLICT`
- `RATE_LIMIT_EXCEEDED`
- `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`
- `USER_DISABLED`, `PERMISSION_DENIED`, `QUOTA_EXCEEDED`

---

### 4. **Rate Limiting** (`src/middleware/rateLimiter.ts`)
Protege contra abuso:

```typescript
import { rateLimiters } from './middleware/rateLimiter.js';

// Já configurados e aplicados no main.ts:
// - /admin/auth: 5 tentativas por 15 minutos
// - /webhook: 1000 requisições por minuto
// - /admin: 500 requisições por minuto
// - /: 100 requisições por 15 minutos

// Resposta ao ultrapassar limite:
// {
//   "success": false,
//   "error": {
//     "code": "RATE_LIMIT_EXCEEDED",
//     "message": "Too many requests. Retry after 45 seconds.",
//     "retryAfter": 45
//   },
//   "timestamp": "...",
//   "requestId": "..."
// }

// Headers inclusos:
// X-RateLimit-Limit: 100
// X-RateLimit-Remaining: 25
// X-RateLimit-Reset: 1705318200
// Retry-After: 45
```

---

### 5. **Request Logger** (`src/middleware/requestLogger.ts`)
Rastreia cada requisição:

```typescript
// Automaticamente:
// 1. Gera X-Request-ID (UUID)
// 2. Loga método, caminho, IP, user-agent
// 3. Registra tempo de resposta
// 4. Limpa dados sensíveis (passwords, tokens)
// 5. Usa diferentes níveis (INFO, WARN, ERROR)

// Log exemplo:
// [2024-01-15T10:30:00.000Z] INFO [2024-01-15T10:30:00.000Z] [HTTP]: 
// POST /admin/whitelist 
// { method: 'POST', path: '/admin/whitelist', statusCode: 200, duration: '45ms' }
```

---

## 📋 Como usar em uma rota

```typescript
import { Router } from 'express';
import { requestSchemas, validateRequest } from '../utils/validator.js';
import { errors } from '../utils/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Exemplo 1: Com validação
router.post('/whitelist', validateRequest(requestSchemas.addUser), asyncHandler(async (req, res) => {
  const { phone_number, permitted_until } = req.validated;
  
  // Lógica
  const user = await createUser(phone_number, permitted_until);
  
  logger.info('User created', 'WhitelistService', { userId: user.id }, req.id);
  
  res.json({
    success: true,
    data: user,
    requestId: req.id,
  });
}));

// Exemplo 2: Com error handling
router.get('/whitelist/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    throw errors.notFound('User', req.params.id);
  }
  
  if (user.status === 'disabled') {
    throw errors.userDisabled(req.params.id);
  }
  
  res.json({
    success: true,
    data: user,
    requestId: req.id,
  });
}));

// Exemplo 3: Com logging manual
router.post('/admin/login', asyncHandler(async (req, res) => {
  const { password } = req.body;
  
  logger.debug('Login attempt', 'Auth', { ip: req.ip }, req.id);
  
  const isValid = validatePassword(password);
  
  if (!isValid) {
    logger.warn('Invalid login attempt', 'Auth', { ip: req.ip }, req.id);
    throw errors.invalidCredentials('Invalid admin password');
  }
  
  const token = generateToken();
  logger.info('Admin logged in', 'Auth', undefined, req.id);
  
  res.json({
    success: true,
    token,
    requestId: req.id,
  });
}));

export default router;
```

---

## 🔍 Próximas melhorias

- [ ] Adicionar trace/span IDs (OpenTelemetry)
- [ ] Integração com Sentry para error reporting
- [ ] Database connection pooling improvements
- [ ] API response caching
- [ ] Circuit breaker para serviços externos
- [ ] Request signature validation para webhooks

---

## 📦 Instalação das dependências

```bash
npm install uuid zod
```

---

## 🚀 Para usar

1. Instale dependências: `npm install`
2. Compile: `npm run build`
3. Inicie: `npm start`
4. Logs estarão em: `/logs/`

Todos os arquivos foram criados e já estão integrados no `main.ts`!
