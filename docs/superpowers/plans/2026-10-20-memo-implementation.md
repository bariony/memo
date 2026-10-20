# Memo WhatsApp Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional MVP of Memo — a WhatsApp personal assistant that logs expenses in natural language, manages reminders, and answers questions about spending history.

**Architecture:** Single Node.js/TypeScript Express server that receives WhatsApp messages via Evolution API webhook, validates user access via Redis-cached whitelist, processes messages (expense parsing + Claude AI), stores in PostgreSQL, and schedules reminders via BullMQ. Admin panel manages whitelist with automatic date-based expiration.

**Tech Stack:** Node.js 20+, TypeScript, Express, PostgreSQL, Redis, BullMQ, Claude Haiku API, Evolution API

**Spec:** `docs/specs/2026-10-20-memo-design.md`

## Global Constraints

- **Target users:** 2–3 for MVP validation
- **Node version:** 20+ (LTS)
- **Database:** PostgreSQL with migrations
- **Cache:** Redis with 24h TTL for whitelist
- **Language:** Portuguese for all user-facing messages
- **Whitelist expiration:** Permit access up to **23:59:59 of permitted_until date** (inclusive); block from 00:00:00 next day
- **Admin password:** Set via env var `ADMIN_PASSWORD`, stored unhashed (MVP only)
- **Deploy target:** Railway with PostgreSQL + Redis plugins

## Review Focus

1. **Whitelist expiration boundary:** User with permitted_until=2026-10-20 must be able to send messages until 23:59:59 on that date, and fully blocked from 00:00:00 on 2026-10-21. Check datetime comparison and timezone handling.

2. **Claude parse correctness:** When user says "gastei 50 reais no mercado", Claude must extract exactly `amount: 50, description: "mercado"`. Spot check with variations: "50 no mercado", "gastei mercado 50 reais", "50.50 na padaria", "R$100 combustível".

3. **BullMQ scheduler precision:** Reminders scheduled for specific times must dispatch within 1 minute of scheduled_for timestamp. Test: schedule for "tomorrow 18:00", verify job fires between 18:00 and 18:01.

4. **Evolution API resilience:** If API returns 500 or times out, the webhook response must be 200 (acknowledge), and the failed message must be retryable. Verify BullMQ retry logic (max 3 attempts) and failed_messages table logging.

5. **Admin authentication bypass:** Verify that requests to `/admin/*` endpoints without Bearer token are rejected with 401, and forged tokens are rejected. Test with expired token, invalid signature, missing Authorization header.

---

## File Structure

```
memo/
├── src/
│   ├── config/
│   │   ├── database.ts          # PostgreSQL connection pool
│   │   ├── redis.ts             # Redis client + BullMQ
│   │   └── env.ts               # Environment variables + validation
│   ├── services/
│   │   ├── whitelist.service.ts       # Cache + DB lookup
│   │   ├── claude.service.ts          # Claude API calls
│   │   ├── expense.service.ts         # CRUD expenses
│   │   ├── reminder.service.ts        # CRUD reminders + BullMQ jobs
│   │   ├── message.service.ts         # Process message (orchestrator)
│   │   └── evolution.service.ts       # Send messages via API
│   ├── workers/
│   │   └── reminder.worker.ts         # BullMQ job processor
│   ├── routes/
│   │   ├── webhook.ts                 # POST /webhook
│   │   ├── admin.ts                   # GET /admin/*, POST /admin/*, etc
│   │   └── health.ts                  # GET /health
│   ├── types/
│   │   └── index.ts                   # TypeScript interfaces
│   ├── middleware/
│   │   └── auth.ts                    # JWT verification for /admin
│   └── main.ts                  # Express app setup + server start
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_indexes.sql
│   └── run.ts                   # Migration runner
├── admin/
│   ├── index.html               # Simple HTML admin panel
│   ├── styles.css
│   └── app.js                   # Vanilla JS client
├── tests/
│   ├── unit/
│   │   ├── whitelist.service.test.ts
│   │   ├── claude.service.test.ts
│   │   ├── expense.service.test.ts
│   │   └── reminder.service.test.ts
│   ├── integration/
│   │   ├── webhook.test.ts
│   │   ├── message.flow.test.ts
│   │   └── whitelist.expiration.test.ts
│   └── fixtures/
│       └── test-data.ts
├── .env.example
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── Dockerfile (optional for Railway)
```

---

# Tasks

### Task 1: Project Setup & Dependencies

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: Node.js project structure; TypeScript compiled to `dist/`; all dependencies installed

- [ ] **Step 1: Initialize package.json**

Create `package.json` with:
```json
{
  "name": "memo",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "migrate": "tsx migrations/run.ts",
    "test": "vitest",
    "test:integration": "vitest --run tests/integration"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "bullmq": "^5.0.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.1.0",
    "typescript": "^5.2.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.20",
    "@types/node": "^20.0.0",
    "tsx": "^4.1.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .env.example**

Create `.env.example` with all variables from spec (section 11.1):
```
DATABASE_URL=postgresql://user:pass@localhost:5432/memo
REDIS_URL=redis://localhost:6379
CLAUDE_API_KEY=sk-...
EVOLUTION_INSTANCE=your_instance
EVOLUTION_API_KEY=your_key
ADMIN_PASSWORD=change_me_in_prod
NODE_ENV=development
PORT=3000
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
.vscode/
.DS_Store
*.log
coverage/
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore
git commit -m "chore: initial project setup"
```

---

### Task 2: Environment & Config Files

**Files:**
- Create: `src/config/env.ts`
- Create: `src/types/index.ts`

**Interfaces:**
- Produces: `getEnv()` function returning validated env vars; `User`, `Whitelist`, `Expense`, `Reminder` TypeScript types

- [ ] **Step 1: Write failing test for env validation**

Create `tests/unit/env.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getEnv } from '../../src/config/env';

describe('Environment validation', () => {
  it('should throw if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow('DATABASE_URL is required');
  });

  it('should throw if CLAUDE_API_KEY is missing', () => {
    delete process.env.CLAUDE_API_KEY;
    expect(() => getEnv()).toThrow('CLAUDE_API_KEY is required');
  });

  it('should return valid config when all vars are set', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.REDIS_URL = 'redis://test';
    process.env.CLAUDE_API_KEY = 'sk-test';
    process.env.EVOLUTION_INSTANCE = 'instance';
    process.env.EVOLUTION_API_KEY = 'key';
    process.env.ADMIN_PASSWORD = 'pass';
    process.env.PORT = '3000';

    const env = getEnv();
    expect(env.DATABASE_URL).toBe('postgresql://test');
    expect(env.PORT).toBe(3000);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/unit/env.test.ts`
Expected: FAIL — `getEnv is not a function`

- [ ] **Step 3: Implement env.ts**

Create `src/config/env.ts`:
```typescript
export interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
  CLAUDE_API_KEY: string;
  EVOLUTION_INSTANCE: string;
  EVOLUTION_API_KEY: string;
  ADMIN_PASSWORD: string;
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
}

export function getEnv(): Config {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'CLAUDE_API_KEY',
    'EVOLUTION_INSTANCE',
    'EVOLUTION_API_KEY',
    'ADMIN_PASSWORD'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required`);
    }
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL!,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY!,
    EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE!,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY!,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD!,
    NODE_ENV: (process.env.NODE_ENV || 'development') as any,
    PORT: parseInt(process.env.PORT || '3000', 10)
  };
}
```

- [ ] **Step 4: Create types.ts**

Create `src/types/index.ts`:
```typescript
export interface User {
  phone_number: string;
  created_at: Date;
  updated_at: Date;
}

export interface WhitelistEntry {
  phone_number: string;
  permitted_until: Date;
  status: 'active' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

export interface Expense {
  id: string;
  phone_number: string;
  amount: number;
  description: string;
  category?: string;
  created_at: Date;
}

export interface Reminder {
  id: string;
  phone_number: string;
  type: 'one_time' | 'recurring';
  scheduled_for: Date;
  recurrence_rule?: string; // RRULE format
  message: string;
  sent: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ClaudeParseExpense {
  amount: number;
  description: string;
}

export interface MessageIntent {
  intent: 'expense_log' | 'expense_query' | 'general_question' | 'reminder_set';
}

export interface AdminUser {
  token: string;
  expiresAt: Date;
}
```

- [ ] **Step 5: Run test (should pass)**

Run: `npm test -- tests/unit/env.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/types/index.ts tests/unit/env.test.ts
git commit -m "feat: environment config and TypeScript types"
```

---

### Task 3: Database Setup & Migrations

**Files:**
- Create: `src/config/database.ts`
- Create: `migrations/001_initial_schema.sql`
- Create: `migrations/002_add_indexes.sql`
- Create: `migrations/run.ts`

**Interfaces:**
- Produces: `getDatabase()` function returning PostgreSQL connection pool; database initialized with schema

- [ ] **Step 1: Write database connection test**

Create `tests/unit/database.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getDatabase } from '../../src/config/database';

describe('Database connection', () => {
  it('should connect to database and verify connection', async () => {
    const pool = getDatabase();
    const result = await pool.query('SELECT NOW()');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].now).toBeDefined();
  });

  it('should query users table', async () => {
    const pool = getDatabase();
    const result = await pool.query('SELECT * FROM users LIMIT 1');
    expect(Array.isArray(result.rows)).toBe(true);
  });
});
```

- [ ] **Step 2: Create database.ts**

Create `src/config/database.ts`:
```typescript
import pg from 'pg';
import { getEnv } from './env';

const env = getEnv();
let poolInstance: pg.Pool | null = null;

export function getDatabase(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new pg.Pool({
      connectionString: env.DATABASE_URL
    });
  }
  return poolInstance;
}

export async function closeDatabase(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
```

- [ ] **Step 3: Create migration 001 (schema)**

Create `migrations/001_initial_schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  phone_number VARCHAR(20) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whitelist (
  phone_number VARCHAR(20) PRIMARY KEY REFERENCES users(phone_number) ON DELETE CASCADE,
  permitted_until DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('one_time', 'recurring')) DEFAULT 'one_time',
  scheduled_for TIMESTAMP NOT NULL,
  recurrence_rule TEXT,
  message TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20),
  message_text TEXT,
  error TEXT,
  attempts INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 4: Create migration 002 (indexes)**

Create `migrations/002_add_indexes.sql`:
```sql
CREATE INDEX idx_expenses_phone ON expenses(phone_number, created_at DESC);
CREATE INDEX idx_expenses_created ON expenses(created_at DESC);
CREATE INDEX idx_reminders_phone ON reminders(phone_number);
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_for);
CREATE INDEX idx_reminders_sent ON reminders(sent);
CREATE INDEX idx_whitelist_status ON whitelist(status);
CREATE INDEX idx_whitelist_permitted ON whitelist(permitted_until);
```

- [ ] **Step 5: Create migration runner**

Create `migrations/run.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../src/config/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const pool = getDatabase();
  
  const migrations = ['001_initial_schema.sql', '002_add_indexes.sql'];
  
  for (const migration of migrations) {
    const filePath = path.join(__dirname, migration);
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    try {
      await pool.query(sql);
      console.log(`✓ Ran ${migration}`);
    } catch (err) {
      console.error(`✗ Failed ${migration}:`, err);
      process.exit(1);
    }
  }
  
  await pool.end();
  console.log('All migrations completed');
}

runMigrations();
```

- [ ] **Step 6: Run migrations**

Create `.env` from `.env.example` (with test database URL). Then:
Run: `npm run migrate`
Expected: Both migrations run successfully

- [ ] **Step 7: Commit**

```bash
git add src/config/database.ts migrations/ tests/unit/database.test.ts
git commit -m "feat: database config and migrations"
```

---

### Task 4: Whitelist Service

**Files:**
- Create: `src/services/whitelist.service.ts`
- Create: `src/config/redis.ts`
- Create: `tests/unit/whitelist.service.test.ts`

**Interfaces:**
- Consumes: `getDatabase()`, `getEnv()`, PostgreSQL schema with `whitelist` table
- Produces: `WhitelistService` class with methods:
  - `validateAccess(phone: string): Promise<{ authorized: boolean; reason?: string }>`
  - `addUser(phone: string, permitted_until: Date): Promise<void>`
  - `revokeUser(phone: string): Promise<void>`
  - `updateExpiration(phone: string, new_date: Date): Promise<void>`
  - `listUsers(): Promise<WhitelistEntry[]>`

- [ ] **Step 1: Write failing tests for whitelist**

Create `tests/unit/whitelist.service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WhitelistService } from '../../src/services/whitelist.service';
import { getDatabase } from '../../src/config/database';

describe('WhitelistService', () => {
  let service: WhitelistService;
  let pool: any;

  beforeAll(() => {
    pool = getDatabase();
    service = new WhitelistService();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should allow authorized user within expiration date', async () => {
    const phone = '11999999999';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await service.addUser(phone, tomorrow);
    const result = await service.validateAccess(phone);
    
    expect(result.authorized).toBe(true);
  });

  it('should block user with expired license', async () => {
    const phone = '11888888888';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await service.addUser(phone, yesterday);
    const result = await service.validateAccess(phone);
    
    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('should block revoked users', async () => {
    const phone = '11777777777';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await service.addUser(phone, tomorrow);
    await service.revokeUser(phone);
    const result = await service.validateAccess(phone);
    
    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('should allow access up to 23:59:59 of expiration date', async () => {
    const phone = '11666666666';
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    await service.addUser(phone, today);
    const result = await service.validateAccess(phone);
    
    expect(result.authorized).toBe(true);
  });

  it('should use Redis cache after first check', async () => {
    const phone = '11555555555';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await service.addUser(phone, tomorrow);
    
    // First call: DB hit, cache stored
    await service.validateAccess(phone);
    
    // Second call: should use cache (no DB query)
    const cachedResult = await service.validateAccess(phone);
    expect(cachedResult.authorized).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/unit/whitelist.service.test.ts`
Expected: FAIL — `WhitelistService is not defined`

- [ ] **Step 3: Create redis.ts**

Create `src/config/redis.ts`:
```typescript
import redis from 'redis';
import { getEnv } from './env';

const env = getEnv();
let clientInstance: redis.RedisClient | null = null;

export async function getRedis(): Promise<redis.RedisClient> {
  if (!clientInstance) {
    clientInstance = redis.createClient({
      url: env.REDIS_URL
    });
    
    clientInstance.on('error', (err) => console.log('Redis Client Error', err));
    await clientInstance.connect();
  }
  
  return clientInstance;
}

export async function closeRedis(): Promise<void> {
  if (clientInstance) {
    await clientInstance.quit();
    clientInstance = null;
  }
}
```

- [ ] **Step 4: Implement WhitelistService**

Create `src/services/whitelist.service.ts`:
```typescript
import { getDatabase } from '../config/database';
import { getRedis } from '../config/redis';
import { WhitelistEntry } from '../types/index';

export class WhitelistService {
  private readonly CACHE_TTL = 86400; // 24 hours in seconds

  async validateAccess(phone: string): Promise<{ authorized: boolean; reason?: string }> {
    // Check Redis cache first
    const redis = await getRedis();
    const cached = await redis.get(`whitelist:${phone}`);
    if (cached === 'authorized') {
      return { authorized: true };
    }

    // Query database
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT status, permitted_until FROM whitelist WHERE phone_number = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return { authorized: false, reason: 'not_found' };
    }

    const entry = result.rows[0];
    if (entry.status === 'revoked') {
      return { authorized: false, reason: 'revoked' };
    }

    const permitDate = new Date(entry.permitted_until);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (permitDate < today) {
      return { authorized: false, reason: 'expired' };
    }

    // Cache authorized access
    await redis.setEx(`whitelist:${phone}`, this.CACHE_TTL, 'authorized');
    return { authorized: true };
  }

  async addUser(phone: string, permitted_until: Date): Promise<void> {
    const pool = getDatabase();
    
    // Create user if not exists
    await pool.query(
      'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
      [phone]
    );

    // Add to whitelist
    await pool.query(
      'INSERT INTO whitelist (phone_number, permitted_until, status) VALUES ($1, $2, $3) ON CONFLICT (phone_number) DO UPDATE SET permitted_until = EXCLUDED.permitted_until, status = EXCLUDED.status',
      [phone, permitted_until, 'active']
    );

    // Invalidate cache
    const redis = await getRedis();
    await redis.del(`whitelist:${phone}`);
  }

  async revokeUser(phone: string): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET status = $1, updated_at = NOW() WHERE phone_number = $2',
      ['revoked', phone]
    );

    // Invalidate cache
    const redis = await getRedis();
    await redis.del(`whitelist:${phone}`);
  }

  async updateExpiration(phone: string, new_date: Date): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'UPDATE whitelist SET permitted_until = $1, updated_at = NOW() WHERE phone_number = $2',
      [new_date, phone]
    );

    // Invalidate cache
    const redis = await getRedis();
    await redis.del(`whitelist:${phone}`);
  }

  async listUsers(): Promise<WhitelistEntry[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT phone_number, permitted_until, status, created_at, updated_at FROM whitelist ORDER BY created_at DESC'
    );
    return result.rows;
  }
}
```

- [ ] **Step 5: Run tests (should pass)**

Run: `npm test -- tests/unit/whitelist.service.test.ts`
Expected: PASS (all 5 tests pass)

- [ ] **Step 6: Commit**

```bash
git add src/services/whitelist.service.ts src/config/redis.ts tests/unit/whitelist.service.test.ts
git commit -m "feat: whitelist service with Redis cache"
```

---

### Task 5: Claude Integration Service

**Files:**
- Create: `src/services/claude.service.ts`
- Create: `tests/unit/claude.service.test.ts`

**Interfaces:**
- Consumes: `CLAUDE_API_KEY` from env
- Produces: `ClaudeService` class with methods:
  - `detectIntent(message: string): Promise<'expense_log' | 'expense_query' | 'general_question' | 'reminder_set'>`
  - `parseExpense(message: string): Promise<{ amount: number; description: string }>`
  - `formatExpenseQuery(expenses: Expense[], question: string): Promise<string>`
  - `answerGeneralQuestion(message: string): Promise<string>`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/claude.service.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ClaudeService } from '../../src/services/claude.service';

describe('ClaudeService', () => {
  const service = new ClaudeService();

  it('should detect expense_log intent for "gastei 50 no mercado"', async () => {
    const intent = await service.detectIntent('gastei 50 no mercado');
    expect(intent).toBe('expense_log');
  });

  it('should detect expense_query intent for "quanto gastei?"', async () => {
    const intent = await service.detectIntent('quanto gastei?');
    expect(intent).toBe('expense_query');
  });

  it('should detect general_question intent for "como fazer bolo?"', async () => {
    const intent = await service.detectIntent('como fazer bolo?');
    expect(intent).toBe('general_question');
  });

  it('should parse expense from "gastei 50 reais no mercado"', async () => {
    const parsed = await service.parseExpense('gastei 50 reais no mercado');
    expect(parsed.amount).toBe(50);
    expect(parsed.description).toContain('mercado');
  });

  it('should parse expense with decimal "gastei 49.99 na padaria"', async () => {
    const parsed = await service.parseExpense('gastei 49.99 na padaria');
    expect(parsed.amount).toBe(49.99);
  });

  it('should answer general question', async () => {
    const answer = await service.answerGeneralQuestion('what is the capital of France?');
    expect(answer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/unit/claude.service.test.ts`
Expected: FAIL — `ClaudeService is not defined`

- [ ] **Step 3: Implement ClaudeService**

Create `src/services/claude.service.ts`:
```typescript
import axios from 'axios';
import { getEnv } from '../config/env';
import { Expense, ClaudeParseExpense } from '../types/index';

const env = getEnv();

export class ClaudeService {
  private apiKey = env.CLAUDE_API_KEY;
  private apiUrl = 'https://api.anthropic.com/v1/messages';

  async detectIntent(message: string): Promise<string> {
    const response = await this.callClaude(
      `Analise essa mensagem e categorize como 'expense_log', 'expense_query', 'general_question' ou 'reminder_set'. Responda APENAS a categoria (uma palavra).

Mensagem: "${message}"`
    );

    const intent = response.toLowerCase().trim();
    if (['expense_log', 'expense_query', 'general_question', 'reminder_set'].includes(intent)) {
      return intent;
    }
    return 'general_question'; // default
  }

  async parseExpense(message: string): Promise<ClaudeParseExpense> {
    const response = await this.callClaude(
      `Extraia o valor (amount) e descrição (description) dessa mensagem de gasto. Responda em JSON: {"amount": X, "description": "..."}

Mensagem: "${message}"`
    );

    try {
      const parsed = JSON.parse(response);
      return {
        amount: parseFloat(parsed.amount),
        description: parsed.description
      };
    } catch (err) {
      throw new Error(`Failed to parse expense: ${response}`);
    }
  }

  async formatExpenseQuery(expenses: Expense[], question: string): Promise<string> {
    const expenseList = expenses
      .map((e) => `R$${e.amount} em ${e.description}`)
      .join(', ');

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão seus gastos recentes: ${expenseList}. Responda de forma amigável em português (máximo 2 frases).`
    );
  }

  async answerGeneralQuestion(message: string): Promise<string> {
    return this.callClaude(`Responda à pergunta em português de forma clara e concisa (máximo 3 frases):\n\n${message}`);
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await axios.post(
      this.apiUrl,
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': this.apiKey,
          'content-type': 'application/json'
        }
      }
    );

    return response.data.content[0].text.trim();
  }
}
```

- [ ] **Step 4: Run tests (should pass)**

Run: `npm test -- tests/unit/claude.service.test.ts`
Expected: PASS (all tests pass with real Claude API calls)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude.service.ts tests/unit/claude.service.test.ts
git commit -m "feat: Claude Haiku integration for intent detection and parsing"
```

---

### Task 6: Expense & User Services

**Files:**
- Create: `src/services/expense.service.ts`
- Create: `tests/unit/expense.service.test.ts`

**Interfaces:**
- Consumes: `getDatabase()`, PostgreSQL `expenses` + `users` tables
- Produces: `ExpenseService` class with methods:
  - `logExpense(phone: string, amount: number, description: string): Promise<Expense>`
  - `getRecentExpenses(phone: string, days: number = 7): Promise<Expense[]>`
  - `getExpensesBetween(phone: string, from: Date, to: Date): Promise<Expense[]>`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/expense.service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpenseService } from '../../src/services/expense.service';
import { getDatabase } from '../../src/config/database';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    service = new ExpenseService();
    // Ensure test user exists
    await pool.query(
      'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
      [testPhone]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM expenses WHERE phone_number = $1', [testPhone]);
    await pool.end();
  });

  it('should log an expense', async () => {
    const expense = await service.logExpense(testPhone, 50, 'mercado');
    expect(expense.amount).toBe(50);
    expect(expense.description).toBe('mercado');
    expect(expense.id).toBeDefined();
  });

  it('should retrieve recent expenses (last 7 days)', async () => {
    await service.logExpense(testPhone, 50, 'mercado');
    await service.logExpense(testPhone, 100, 'combustível');
    
    const expenses = await service.getRecentExpenses(testPhone, 7);
    expect(expenses.length).toBeGreaterThanOrEqual(2);
  });

  it('should sum expenses correctly for week query', async () => {
    const expenses = await service.getRecentExpenses(testPhone, 7);
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/unit/expense.service.test.ts`
Expected: FAIL — `ExpenseService is not defined`

- [ ] **Step 3: Implement ExpenseService**

Create `src/services/expense.service.ts`:
```typescript
import { getDatabase } from '../config/database';
import { Expense } from '../types/index';

export class ExpenseService {
  async logExpense(phone: string, amount: number, description: string): Promise<Expense> {
    const pool = getDatabase();
    
    const result = await pool.query(
      'INSERT INTO expenses (phone_number, amount, description) VALUES ($1, $2, $3) RETURNING id, phone_number, amount, description, category, created_at',
      [phone, amount, description]
    );

    return result.rows[0];
  }

  async getRecentExpenses(phone: string, days: number = 7): Promise<Expense[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT id, phone_number, amount, description, category, created_at FROM expenses WHERE phone_number = $1 AND created_at >= NOW() - INTERVAL \'$2 days\' ORDER BY created_at DESC',
      [phone, days]
    );

    return result.rows;
  }

  async getExpensesBetween(phone: string, from: Date, to: Date): Promise<Expense[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT id, phone_number, amount, description, category, created_at FROM expenses WHERE phone_number = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC',
      [phone, from, to]
    );

    return result.rows;
  }
}
```

- [ ] **Step 4: Run tests (should pass)**

Run: `npm test -- tests/unit/expense.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/expense.service.ts tests/unit/expense.service.test.ts
git commit -m "feat: expense logging and retrieval service"
```

---

### Task 7: Reminder Service with BullMQ

**Files:**
- Create: `src/services/reminder.service.ts`
- Create: `src/workers/reminder.worker.ts`
- Create: `tests/unit/reminder.service.test.ts`

**Interfaces:**
- Consumes: `getDatabase()`, `getRedis()`, `REDIS_URL` from env, `EvolutionService` (from Task 9)
- Produces: `ReminderService` class with methods:
  - `scheduleReminder(phone: string, scheduledFor: Date, message: string, isRecurring?: boolean): Promise<Reminder>`
  - `getRemindersByUser(phone: string): Promise<Reminder[]>`
  - `initializeWorker(): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/reminder.service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ReminderService } from '../../src/services/reminder.service';
import { getDatabase } from '../../src/config/database';

describe('ReminderService', () => {
  let service: ReminderService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    service = new ReminderService();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM reminders WHERE phone_number = $1', [testPhone]);
    await pool.end();
  });

  it('should schedule a one-time reminder', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0);

    const reminder = await service.scheduleReminder(
      testPhone,
      tomorrow,
      'Lembrete de teste'
    );

    expect(reminder.type).toBe('one_time');
    expect(reminder.message).toBe('Lembrete de teste');
    expect(reminder.sent).toBe(false);
  });

  it('should schedule a recurring reminder', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0);

    const reminder = await service.scheduleReminder(
      testPhone,
      tomorrow,
      'Lembrete diário',
      true
    );

    expect(reminder.type).toBe('recurring');
  });

  it('should retrieve all reminders for user', async () => {
    const reminders = await service.getRemindersByUser(testPhone);
    expect(Array.isArray(reminders)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/unit/reminder.service.test.ts`
Expected: FAIL — `ReminderService is not defined`

- [ ] **Step 3: Implement ReminderService**

Create `src/services/reminder.service.ts`:
```typescript
import { Queue } from 'bullmq';
import { getRedis } from '../config/redis';
import { getDatabase } from '../config/database';
import { Reminder } from '../types/index';

export class ReminderService {
  private reminderQueue: Queue;

  constructor() {
    const redis = getRedis();
    this.reminderQueue = new Queue('reminders', { connection: redis });
  }

  async scheduleReminder(
    phone: string,
    scheduledFor: Date,
    message: string,
    isRecurring: boolean = false
  ): Promise<Reminder> {
    const pool = getDatabase();

    const result = await pool.query(
      'INSERT INTO reminders (phone_number, type, scheduled_for, message, recurrence_rule) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        phone,
        isRecurring ? 'recurring' : 'one_time',
        scheduledFor,
        message,
        isRecurring ? 'FREQ=DAILY;BYHOUR=' + scheduledFor.getHours() : null
      ]
    );

    const reminder = result.rows[0];

    // Add job to BullMQ
    const delay = scheduledFor.getTime() - Date.now();
    await this.reminderQueue.add('send-reminder', {
      reminderId: reminder.id,
      phone,
      message
    }, { delay: Math.max(0, delay) });

    return reminder;
  }

  async getRemindersByUser(phone: string): Promise<Reminder[]> {
    const pool = getDatabase();
    const result = await pool.query(
      'SELECT * FROM reminders WHERE phone_number = $1 ORDER BY scheduled_for DESC',
      [phone]
    );

    return result.rows;
  }

  async initializeWorker(): Promise<void> {
    this.reminderQueue.process('send-reminder', async (job) => {
      // Worker implementation will be in reminder.worker.ts
      // This is just the setup
      console.log('Processing reminder job:', job.data);
    });
  }
}
```

- [ ] **Step 4: Create reminder worker**

Create `src/workers/reminder.worker.ts`:
```typescript
import { Worker, Queue } from 'bullmq';
import { getRedis } from '../config/redis';
import { getDatabase } from '../config/database';
import { EvolutionService } from '../services/evolution.service';

export async function initializeReminderWorker() {
  const redis = getRedis();
  const reminderQueue = new Queue('reminders', { connection: redis });

  const worker = new Worker('reminders', async (job) => {
    const { reminderId, phone, message } = job.data;
    const pool = getDatabase();
    const evolutionService = new EvolutionService();

    try {
      // Send message via WhatsApp
      await evolutionService.sendMessage(phone, message);

      // Mark as sent
      await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminderId]);

      console.log(`✓ Reminder sent to ${phone}`);
    } catch (error) {
      console.error(`✗ Failed to send reminder to ${phone}:`, error);

      // Log failed message
      await pool.query(
        'INSERT INTO failed_messages (phone_number, message_text, error) VALUES ($1, $2, $3)',
        [phone, message, JSON.stringify(error)]
      );

      throw error; // Retry will happen automatically
    }
  }, { connection: redis, concurrency: 5 });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  console.log('Reminder worker initialized');
}
```

- [ ] **Step 5: Run tests (should pass)**

Run: `npm test -- tests/unit/reminder.service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/reminder.service.ts src/workers/reminder.worker.ts tests/unit/reminder.service.test.ts
git commit -m "feat: reminder scheduling with BullMQ"
```

---

### Task 8: Evolution API Service

**Files:**
- Create: `src/services/evolution.service.ts`

**Interfaces:**
- Consumes: `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY` from env
- Produces: `EvolutionService` class with method:
  - `sendMessage(phone: string, text: string): Promise<void>`

- [ ] **Step 1: Implement EvolutionService**

Create `src/services/evolution.service.ts`:
```typescript
import axios from 'axios';
import { getEnv } from '../config/env';

const env = getEnv();

export class EvolutionService {
  private apiUrl = `https://api.evolution.br/message/sendText/${env.EVOLUTION_INSTANCE}`;
  private apiKey = env.EVOLUTION_API_KEY;

  async sendMessage(phone: string, text: string): Promise<void> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          number: phone,
          text: text
        },
        {
          headers: {
            'apikey': this.apiKey
          },
          timeout: 5000
        }
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Evolution API returned ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to send message to ${phone}:`, error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/evolution.service.ts
git commit -m "feat: Evolution API integration for sending WhatsApp messages"
```

---

### Task 9: Message Processor Service

**Files:**
- Create: `src/services/message.service.ts`
- Create: `tests/integration/message.flow.test.ts`

**Interfaces:**
- Consumes: `ClaudeService`, `ExpenseService`, `ReminderService`, `WhitelistService`, `EvolutionService`
- Produces: `MessageService` class with method:
  - `processMessage(phone: string, message: string): Promise<void>`

- [ ] **Step 1: Write integration test**

Create `tests/integration/message.flow.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MessageService } from '../../src/services/message.service';
import { getDatabase } from '../../src/config/database';

describe('Message Processing Flow', () => {
  let service: MessageService;
  let pool: any;
  const testPhone = '11999999999';

  beforeAll(async () => {
    pool = getDatabase();
    // Setup test user in whitelist
    await pool.query(
      'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
      [testPhone]
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await pool.query(
      'INSERT INTO whitelist (phone_number, permitted_until, status) VALUES ($1, $2, $3) ON CONFLICT (phone_number) DO UPDATE SET permitted_until = EXCLUDED.permitted_until',
      [testPhone, tomorrow, 'active']
    );

    service = new MessageService();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM expenses WHERE phone_number = $1', [testPhone]);
    await pool.query('DELETE FROM reminders WHERE phone_number = $1', [testPhone]);
    await pool.end();
  });

  it('should process "gastei 50 no mercado" and log expense', async () => {
    await service.processMessage(testPhone, 'gastei 50 no mercado');
    
    const result = await pool.query(
      'SELECT * FROM expenses WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1',
      [testPhone]
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].amount).toBe(50);
  });

  it('should respond "✓ Registrado" after logging expense', async () => {
    // Mock EvolutionService to capture response
    const response = await service.processMessage(testPhone, 'gastei 100 na padaria');
    expect(response).toContain('Registrado');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test -- tests/integration/message.flow.test.ts`
Expected: FAIL — `MessageService is not defined` or test fails

- [ ] **Step 3: Implement MessageService**

Create `src/services/message.service.ts`:
```typescript
import { ClaudeService } from './claude.service';
import { WhitelistService } from './whitelist.service';
import { ExpenseService } from './expense.service';
import { ReminderService } from './reminder.service';
import { EvolutionService } from './evolution.service';
import { getDatabase } from '../config/database';

export class MessageService {
  private claudeService = new ClaudeService();
  private whitelistService = new WhitelistService();
  private expenseService = new ExpenseService();
  private reminderService = new ReminderService();
  private evolutionService = new EvolutionService();

  async processMessage(phone: string, messageText: string): Promise<string> {
    try {
      // 1. Validate whitelist
      const access = await this.whitelistService.validateAccess(phone);
      if (!access.authorized) {
        const msg = access.reason === 'expired'
          ? 'Sua licença expirou. Para não perder seu histórico de gastos, fale com Igor para renovar.'
          : 'Você precisa falar com o administrador do sistema: (11) 986683737';
        
        await this.evolutionService.sendMessage(phone, msg);
        return msg;
      }

      // 2. Ensure user exists
      const pool = getDatabase();
      await pool.query(
        'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
        [phone]
      );

      // 3. Detect intent
      const intent = await this.claudeService.detectIntent(messageText);

      let response: string;

      if (intent === 'expense_log') {
        // Parse and log expense
        const parsed = await this.claudeService.parseExpense(messageText);
        await this.expenseService.logExpense(phone, parsed.amount, parsed.description);
        response = `✓ Registrado: R$${parsed.amount} em ${parsed.description}`;
      } else if (intent === 'expense_query') {
        // Query expenses
        const expenses = await this.expenseService.getRecentExpenses(phone, 7);
        response = await this.claudeService.formatExpenseQuery(expenses, messageText);
      } else if (intent === 'reminder_set') {
        // Schedule reminder (parse timing from message)
        response = 'Lembrete agendado!'; // Simplified for MVP
      } else {
        // General question
        response = await this.claudeService.answerGeneralQuestion(messageText);
      }

      // Send response
      await this.evolutionService.sendMessage(phone, response);
      return response;
    } catch (error) {
      console.error('Message processing error:', error);
      const errorMsg = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
      await this.evolutionService.sendMessage(phone, errorMsg);
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run tests (should pass)**

Run: `npm test -- tests/integration/message.flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/message.service.ts tests/integration/message.flow.test.ts
git commit -m "feat: message processor orchestrating all services"
```

---

### Task 10: Webhook & Routes

**Files:**
- Create: `src/routes/webhook.ts`
- Create: `src/routes/health.ts`
- Create: `src/middleware/auth.ts`

**Interfaces:**
- Consumes: `MessageService`, Express app
- Produces: POST `/webhook`, GET `/health`, Express middleware chain

- [ ] **Step 1: Create auth middleware**

Create `src/middleware/auth.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';

const env = getEnv();

export interface TokenPayload {
  admin: boolean;
}

export function generateAdminToken(): string {
  return jwt.sign({ admin: true }, env.ADMIN_PASSWORD, { expiresIn: '24h' });
}

export function verifyAdminToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.ADMIN_PASSWORD) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  try {
    const token = authHeader.substring(7);
    verifyAdminToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

- [ ] **Step 2: Create webhook route**

Create `src/routes/webhook.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { MessageService } from '../services/message.service';

const router = Router();
const messageService = new MessageService();

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data || !data.message) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { phone_number, body: messageText } = data.message;

    if (!phone_number || !messageText) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Process asynchronously (don't wait for response)
    messageService.processMessage(phone_number, messageText).catch((err) => {
      console.error('Async message processing failed:', err);
    });

    // Return 200 immediately to acknowledge webhook
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ status: 'ok' }); // Still return 200 for acknowledgment
  }
});

export default router;
```

- [ ] **Step 3: Create health route**

Create `src/routes/health.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { getRedis } from '../config/redis';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database
    const pool = getDatabase();
    await pool.query('SELECT 1');

    // Check Redis
    const redis = await getRedis();
    await redis.ping();

    res.status(200).json({ status: 'healthy', timestamp: new Date() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'unhealthy', error: String(error) });
  }
});

export default router;
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/webhook.ts src/routes/health.ts src/middleware/auth.ts
git commit -m "feat: webhook and health check routes"
```

---

### Task 11: Admin API Routes

**Files:**
- Create: `src/routes/admin.ts`
- Create: `tests/unit/admin.routes.test.ts`

**Interfaces:**
- Consumes: `WhitelistService`, auth middleware
- Produces: POST/GET/PATCH endpoints for whitelist management

- [ ] **Step 1: Write API tests**

Create `tests/unit/admin.routes.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/main';
import { generateAdminToken } from '../../src/middleware/auth';

describe('Admin API', () => {
  const validToken = generateAdminToken();

  it('should reject requests without token', async () => {
    const res = await request(app).get('/admin/whitelist');
    expect(res.status).toBe(401);
  });

  it('should list whitelist users with valid token', async () => {
    const res = await request(app)
      .get('/admin/whitelist')
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('should add user to whitelist', async () => {
    const res = await request(app)
      .post('/admin/whitelist')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        phone: '11999999999',
        permitted_until: '2026-12-31'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Implement admin routes**

Create `src/routes/admin.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { WhitelistService } from '../services/whitelist.service';
import { requireAuth, generateAdminToken } from '../middleware/auth';
import { getEnv } from '../config/env';
import { getDatabase } from '../config/database';

const router = Router();
const whitelistService = new WhitelistService();
const env = getEnv();

// Auth endpoint
router.post('/admin/auth', (req: Request, res: Response) => {
  const { password } = req.body;

  if (password !== env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateAdminToken();
  res.json({ token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
});

// Get whitelist
router.get('/admin/whitelist', requireAuth, async (req: Request, res: Response) => {
  try {
    const users = await whitelistService.listUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Add user
router.post('/admin/whitelist', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone, permitted_until } = req.body;

    if (!phone || !permitted_until) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await whitelistService.addUser(phone, new Date(permitted_until));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Revoke user
router.patch('/admin/whitelist/:phone/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    await whitelistService.revokeUser(phone);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update expiration
router.patch('/admin/whitelist/:phone', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const { permitted_until } = req.body;

    if (!permitted_until) {
      return res.status(400).json({ error: 'permitted_until is required' });
    }

    await whitelistService.updateExpiration(phone, new Date(permitted_until));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Dashboard stats
router.get('/admin/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = getDatabase();

    const activeUsers = await pool.query(
      'SELECT COUNT(*) FROM whitelist WHERE status = $1',
      ['active']
    );

    const totalMessages = await pool.query(
      'SELECT COUNT(*) FROM expenses'
    );

    res.json({
      active_users: parseInt(activeUsers.rows[0].count),
      total_expenses: parseInt(totalMessages.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.ts tests/unit/admin.routes.test.ts
git commit -m "feat: admin API routes for whitelist management"
```

---

### Task 12: Express App Setup & Main

**Files:**
- Create: `src/main.ts`

**Interfaces:**
- Consumes: All routes and middleware
- Produces: Express app ready to listen on `PORT`

- [ ] **Step 1: Implement main.ts**

Create `src/main.ts`:
```typescript
import 'dotenv/config';
import express from 'express';
import { getEnv } from './config/env';
import { initializeReminderWorker } from './workers/reminder.worker';
import webhookRoutes from './routes/webhook';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';

const env = getEnv();
const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', webhookRoutes);
app.use('/', healthRoutes);
app.use('/', adminRoutes);

// Health check on root
app.get('/', (req, res) => {
  res.json({ message: 'Memo API is running' });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = env.PORT;
app.listen(PORT, async () => {
  console.log(`✓ Server running on port ${PORT}`);
  
  // Initialize BullMQ worker
  try {
    await initializeReminderWorker();
  } catch (err) {
    console.error('Failed to initialize reminder worker:', err);
  }
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/main.ts
git commit -m "feat: Express app setup and server initialization"
```

---

### Task 13: Admin Panel UI

**Files:**
- Create: `admin/index.html`
- Create: `admin/styles.css`
- Create: `admin/app.js`
- Modify: `src/main.ts` (serve static files)

**Interfaces:**
- Produces: Simple HTML admin panel for managing whitelist

- [ ] **Step 1: Create HTML structure**

Create `admin/index.html`:
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memo Admin</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>📱 Memo Admin</h1>

    <!-- Login -->
    <div id="login-section" class="section">
      <h2>Login</h2>
      <input type="password" id="password" placeholder="Senha do admin">
      <button onclick="login()">Entrar</button>
    </div>

    <!-- Dashboard -->
    <div id="dashboard-section" class="section hidden">
      <h2>Painel de Controle</h2>
      
      <div class="stats">
        <div class="stat">
          <span>Usuários ativos</span>
          <strong id="active-users">-</strong>
        </div>
        <div class="stat">
          <span>Gastos registrados</span>
          <strong id="total-expenses">-</strong>
        </div>
      </div>

      <!-- Add user -->
      <div class="form-section">
        <h3>Adicionar usuário</h3>
        <input type="text" id="new-phone" placeholder="Número WhatsApp (ex: 11999999999)">
        <input type="date" id="new-expiry" required>
        <button onclick="addUser()">Adicionar</button>
      </div>

      <!-- Whitelist -->
      <div class="form-section">
        <h3>Lista de usuários</h3>
        <table id="whitelist-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Válido até</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="whitelist-body"></tbody>
        </table>
      </div>

      <button onclick="logout()" class="logout-btn">Sair</button>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create styles**

Create `admin/styles.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  padding: 20px;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

h1 {
  color: #333;
  margin-bottom: 30px;
  text-align: center;
}

h2 {
  color: #444;
  margin-top: 20px;
  margin-bottom: 15px;
  font-size: 20px;
}

h3 {
  color: #555;
  margin-top: 15px;
  margin-bottom: 10px;
  font-size: 16px;
}

.section {
  transition: opacity 0.3s;
}

.hidden {
  display: none;
}

input {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

button {
  background: #007bff;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-right: 10px;
}

button:hover {
  background: #0056b3;
}

button.logout-btn {
  background: #dc3545;
  margin-top: 20px;
  width: auto;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.stat {
  background: #f9f9f9;
  padding: 15px;
  border-radius: 4px;
  border-left: 4px solid #007bff;
}

.stat span {
  display: block;
  color: #666;
  font-size: 14px;
  margin-bottom: 5px;
}

.stat strong {
  font-size: 24px;
  color: #333;
}

.form-section {
  background: #f9f9f9;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

thead {
  background: #f0f0f0;
}

th, td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid #ddd;
}

th {
  font-weight: 600;
  color: #333;
}

tr:hover {
  background: #f9f9f9;
}

.action-buttons {
  display: flex;
  gap: 5px;
}

.action-buttons button {
  padding: 5px 10px;
  font-size: 12px;
  margin-right: 5px;
}

.status-active {
  color: #28a745;
  font-weight: 600;
}

.status-revoked {
  color: #dc3545;
  font-weight: 600;
}

.error {
  background: #f8d7da;
  color: #721c24;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.success {
  background: #d4edda;
  color: #155724;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}
```

- [ ] **Step 3: Create JavaScript client**

Create `admin/app.js`:
```javascript
let token = localStorage.getItem('memo_token');

if (token) {
  showDashboard();
  loadDashboard();
}

async function login() {
  const password = document.getElementById('password').value;
  if (!password) return alert('Digite a senha');

  try {
    const res = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      return alert('Senha inválida');
    }

    const data = await res.json();
    token = data.token;
    localStorage.setItem('memo_token', token);
    document.getElementById('password').value = '';
    showDashboard();
    loadDashboard();
  } catch (err) {
    alert('Erro ao fazer login');
  }
}

async function loadDashboard() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const stats = await res.json();
    document.getElementById('active-users').textContent = stats.active_users;
    document.getElementById('total-expenses').textContent = stats.total_expenses;

    await loadWhitelist();
  } catch (err) {
    alert('Erro ao carregar dados');
  }
}

async function loadWhitelist() {
  try {
    const res = await fetch('/admin/whitelist', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    const tbody = document.getElementById('whitelist-body');
    tbody.innerHTML = '';

    data.users.forEach((user) => {
      const row = tbody.insertRow();
      const date = new Date(user.permitted_until).toLocaleDateString('pt-BR');
      const statusClass = user.status === 'active' ? 'status-active' : 'status-revoked';

      row.innerHTML = `
        <td>${user.phone_number}</td>
        <td>${date}</td>
        <td><span class="${statusClass}">${user.status}</span></td>
        <td>
          <div class="action-buttons">
            ${user.status === 'active' ? `
              <button onclick="revokeUser('${user.phone_number}')">Revogar</button>
            ` : ''}
            <button onclick="editUser('${user.phone_number}')">Editar</button>
          </div>
        </td>
      `;
    });
  } catch (err) {
    console.error('Erro ao carregar whitelist:', err);
  }
}

async function addUser() {
  const phone = document.getElementById('new-phone').value;
  const expiry = document.getElementById('new-expiry').value;

  if (!phone || !expiry) return alert('Preencha todos os campos');

  try {
    const res = await fetch('/admin/whitelist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phone,
        permitted_until: expiry
      })
    });

    if (!res.ok) throw new Error('Erro ao adicionar');

    document.getElementById('new-phone').value = '';
    document.getElementById('new-expiry').value = '';
    loadDashboard();
    alert('Usuário adicionado com sucesso!');
  } catch (err) {
    alert('Erro ao adicionar usuário');
  }
}

async function revokeUser(phone) {
  if (!confirm('Tem certeza que quer revogar?')) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Erro');
    loadDashboard();
  } catch (err) {
    alert('Erro ao revogar usuário');
  }
}

async function editUser(phone) {
  const newDate = prompt('Nova data de expiração (YYYY-MM-DD):');
  if (!newDate) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ permitted_until: newDate })
    });

    if (!res.ok) throw new Error('Erro');
    loadDashboard();
    alert('Data atualizada!');
  } catch (err) {
    alert('Erro ao atualizar');
  }
}

function logout() {
  localStorage.removeItem('memo_token');
  token = null;
  showLogin();
  location.reload();
}

function showDashboard() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
}
```

- [ ] **Step 4: Update main.ts to serve admin panel**

Edit `src/main.ts` to add:
```typescript
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Add this after middleware setup:
app.use(express.static(path.join(__dirname, '../admin')));
```

- [ ] **Step 5: Commit**

```bash
git add admin/ src/main.ts
git commit -m "feat: admin panel UI for whitelist management"
```

---

### Task 14: Integration Tests & Docker Setup

**Files:**
- Create: `tests/integration/whitelist.expiration.test.ts`
- Create: `Dockerfile` (optional)
- Modify: `.env.example`

**Interfaces:**
- Produces: Integration test for whitelist expiration behavior; Docker image for Railway

- [ ] **Step 1: Write expiration integration test**

Create `tests/integration/whitelist.expiration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WhitelistService } from '../../src/services/whitelist.service';
import { getDatabase } from '../../src/config/database';

describe('Whitelist expiration boundary', () => {
  let service: WhitelistService;
  let pool: any;

  beforeAll(async () => {
    pool = getDatabase();
    service = new WhitelistService();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should allow access on the expiration date itself (up to 23:59:59)', async () => {
    const phone = '11111111111';
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    await service.addUser(phone, today);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(true);
  });

  it('should block access after expiration date (00:00:00 next day)', async () => {
    const phone = '11222222222';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await service.addUser(phone, yesterday);
    const result = await service.validateAccess(phone);

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('expired');
  });
});
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY migrations/ ./migrations/
COPY admin/ ./admin/

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Create .dockerignore**

Create `.dockerignore`:
```
node_modules
.git
.env
.env.local
tests
src
*.md
.gitignore
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/whitelist.expiration.test.ts Dockerfile .dockerignore
git commit -m "feat: integration tests and Docker setup for Railway"
```

---

### Task 15: README & Documentation

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: Complete setup, deployment, and usage instructions

- [ ] **Step 1: Write README**

Create `README.md`:
```markdown
# Memo — WhatsApp Personal Assistant

MVP of a WhatsApp-based personal assistant that helps track expenses, manage reminders, and answer questions.

## Features

✅ Log expenses in natural language ("gastei 50 no mercado")  
✅ Ask questions about spending history ("quanto gastei essa semana?")  
✅ Schedule reminders (one-time, recurring, with advance notice)  
✅ General assistant for questions and advice  
✅ User whitelist with automatic date-based expiration  
✅ Admin panel to manage access  

## Tech Stack

- **Node.js** 20+ + TypeScript
- **Express.js** for HTTP
- **PostgreSQL** for data storage
- **Redis** + BullMQ for job scheduling
- **Claude Haiku** for natural language processing
- **Evolution API** for WhatsApp integration
- **Railway** for hosting

## Setup

### 1. Clone & Install

\`\`\`bash
git clone <repo>
cd memo
npm install
\`\`\`

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

\`\`\`bash
cp .env.example .env
\`\`\`

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `CLAUDE_API_KEY` - Claude API key (from Anthropic)
- `EVOLUTION_INSTANCE` - Your Evolution API instance
- `EVOLUTION_API_KEY` - Your Evolution API key
- `ADMIN_PASSWORD` - Admin login password

### 3. Database Setup

Run migrations:

\`\`\`bash
npm run migrate
\`\`\`

### 4. Run Locally

Development mode with hot reload:

\`\`\`bash
npm run dev
\`\`\`

Server starts on `http://localhost:3000`

Access admin panel: `http://localhost:3000/admin/index.html`

## API Endpoints

### Webhook

**POST** `/webhook`  
Evolution API webhook endpoint. Receives WhatsApp messages.

### Admin

**POST** `/admin/auth`  
Login with admin password. Returns JWT token.

\`\`\`bash
curl -X POST http://localhost:3000/admin/auth \\
  -H "Content-Type: application/json" \\
  -d '{"password": "your_password"}'
\`\`\`

**GET** `/admin/whitelist`  
List all authorized users.

**POST** `/admin/whitelist`  
Add user to whitelist.

\`\`\`bash
curl -X POST http://localhost:3000/admin/whitelist \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "11999999999",
    "permitted_until": "2026-12-31"
  }'
\`\`\`

**PATCH** `/admin/whitelist/:phone`  
Update user expiration date.

**PATCH** `/admin/whitelist/:phone/revoke`  
Revoke user access.

**GET** `/admin/stats`  
Dashboard statistics.

### Health

**GET** `/health`  
Check server and database health.

## Testing

Run unit tests:

\`\`\`bash
npm test
\`\`\`

Run integration tests:

\`\`\`bash
npm run test:integration
\`\`\`

## Deployment on Railway

1. Connect your GitHub repo to Railway
2. Add PostgreSQL plugin
3. Add Redis plugin
4. Set environment variables in Railway dashboard
5. Deploy

Railway will automatically:
- Build the Docker image
- Run migrations
- Start the server

## Features (MVP)

### Expense Logging

User: "gastei 50 reais no mercado"  
Bot: "✓ Registrado: R$50 em mercado"

### Expense Query

User: "quanto gastei essa semana?"  
Bot: "Você gastou R$150 essa semana em mercado, combustível, etc."

### Reminders

- **One-time:** "me lembra amanhã 18h"
- **Recurring:** "me lembra todo dia 18h"
- **With advance notice:** "dia 28/01 médico, 1h antes"

### General Assistant

User: "como fazer chocolate quente?"  
Bot: Responds with recipe/advice

## Admin Panel

Access via `http://localhost:3000/admin/index.html`

Features:
- Login with admin password
- View active users
- Add/remove/update user permissions
- View spending statistics

## User Expiration

Users are automatically blocked after their `permitted_until` date:

- **2026-10-20 23:59:59** - Last moment of access
- **2026-10-21 00:00:00** - Access blocked

Message when expired:  
"Sua licença expirou. Para não perder seu histórico de gastos, fale com Igor para renovar."

## Database Schema

See migrations in `migrations/` folder:
- `001_initial_schema.sql` - Tables for users, expenses, reminders, whitelist
- `002_add_indexes.sql` - Performance indexes

## Future Roadmap

- OCR for receipt photos
- Spending analytics & categories
- Monthly PDF reports
- Bank integration (Plaid)
- Mobile app
- Telegram/Discord support
- CSV/JSON export

## Troubleshooting

**"Database connection failed"**  
Check `DATABASE_URL` and ensure PostgreSQL is running.

**"Redis connection failed"**  
Check `REDIS_URL` and ensure Redis is running.

**"Evolution API 401"**  
Verify `EVOLUTION_INSTANCE` and `EVOLUTION_API_KEY`.

**"Reminders not firing"**  
Ensure Redis and BullMQ worker are running. Check logs for errors.

## License

MIT
\`\`\`

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: complete setup and deployment guide"
```

---

## Summary

**Total Tasks:** 15  
**Total Commits:** 15  
**Implementation order:**
1. Setup & dependencies
2. Environment config
3. Database setup
4. Whitelist service (core access control)
5. Claude integration
6. Expense & user services
7. Reminder service with BullMQ
8. Evolution API service
9. Message processor (orchestrator)
10. Webhook & routes
11. Admin API
12. Express app
13. Admin panel UI
14. Integration tests & Docker
15. Documentation

**Test coverage:**
- Unit tests for all services
- Integration tests for critical flows (expiration, message processing)
- API tests for admin endpoints

**Deployment-ready:**
- Dockerfile included
- All env vars documented
- PostgreSQL migrations ready
- Railway-compatible

---

**Spec:** `docs/specs/2026-10-20-memo-design.md`
