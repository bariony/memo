# Messaging & Preferences System

This document describes the messaging and user preferences system for Memo, including scheduled messages, user customization, and personalized communication.

## Overview

The system consists of four main components:

1. **User Preferences** (`src/config/userPreferences.ts`) - Configuration schema for user settings
2. **Messaging Service** (`src/services/userMessaging.service.ts`) - Message generation for various events
3. **Messaging Worker** (`src/workers/messaging.worker.ts`) - BullMQ queue for scheduled message delivery
4. **Preferences API** (`src/routes/preferences.ts`) - REST endpoints for managing preferences

## User Preferences

Users can customize:

- **Daily Summary**: Time (HH:MM), timezone, enable/disable
- **Daily Budget**: Maximum spend per day in R$
- **Reminders**: Renewal alerts (7/2/1 days), task reminders, spending alerts
- **Notifications**: Quiet hours (no messages during sleep), vibration, sound
- **Privacy**: Anonymous stats sharing, tracking

### Default Preferences

```typescript
{
  dailySummary: {
    enabled: true,
    time: "08:00",           // 8 AM
    timezone: "America/Sao_Paulo"
  },
  dailyBudget: undefined,    // No limit by default
  currency: "BRL",
  reminders: {
    renewalAlerts: true,     // 7, 2, 1 day reminders
    taskReminders: true,
    spendingAlerts: true
  },
  notifications: {
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00"
    },
    vibrateOnAlert: true,
    soundOnAlert: true
  },
  privacy: {
    shareStats: false,
    trackingEnabled: true
  }
}
```

## Message Types

### 1. Daily Summary

**Trigger**: Every day at user's configured time (default 8 AM)

**Content**:
- Greeting with name
- Today's reminders/tasks
- Budget status (remaining, already spent)
- Call-to-action

```
Bom dia, João! ☀️

📋 Seus compromissos para hoje:
1. Reunião às 14h
2. Pagar conta de internet

💰 Orçamento de hoje:
Limite: R$ 100,00
Já gasto: R$ 32,50
Disponível: R$ 67,50
✅ Você pode gastar até R$ 67,50 hoje

Tenha um ótimo dia! 🌟
```

### 2. Renewal Reminders

Progressive urgency at 7, 2, and 1 day before expiration:

**7 Days Before**:
- Friendly reminder about context loss risk
- Benefit highlights
- Soft CTA: "Renove agora"

**2 Days Before**:
- Increased urgency
- Explicit list of what will be lost
- Stronger CTA

**1 Day Before**:
- Red alert (🚨)
- Final warning
- Emergency CTA: "RENOVAR AGORA"

### 3. Spending Alerts

**Trigger**: When user reaches 80% or exceeds daily budget

**Content**:
- Budget usage percentage
- Remaining available
- Encouragement to economize

### 4. Task Reminders

**Trigger**: User-configured task reminder times

**Content**:
- Task name
- Due time
- Friendly reminder

### 5. Welcome Message

**Trigger**: When new user starts

**Content**:
- Introduction as personal assistant
- Days available
- List of capabilities with examples
- Description of daily summary feature

### 6. Re-Engagement Message

**Trigger**: Every 6 hours, check if user has been inactive for 48+ hours

**Content**:
- Empathetic acknowledgment of busyness
- Reminder that bot is available
- Examples of what the bot can help with
- Friendly invitation to interact

```
Oi João! 👋

Vi que você tá quietinho aí... imagino que esteja bem atarefado, né? 😄

Só queria lembrar que estou por aqui, sempre pronto para ajudar:

💰 Registrar um gasto
⏰ Criar um lembrete  
❓ Tirar uma dúvida
📊 Ver seu resumo

Qualquer coisa, é só chamar! 😊
```

**Database Integration Required**: Needs `last_interaction_at` timestamp on users table to determine inactivity threshold.

## Message Queue System (BullMQ)

Messages are sent asynchronously using BullMQ with Redis backend.

### Message Job Types

```typescript
enum MessageJobType {
  DAILY_SUMMARY = 'daily_summary',
  RENEWAL_REMINDER_7D = 'renewal_reminder_7d',
  RENEWAL_REMINDER_2D = 'renewal_reminder_2d',
  RENEWAL_REMINDER_1D = 'renewal_reminder_1d',
  SPENDING_ALERT = 'spending_alert',
  TASK_REMINDER = 'task_reminder',
  WELCOME = 'welcome',
  RE_ENGAGEMENT = 're_engagement',
}
```

### Re-engagement Worker

Separate worker (`src/workers/reengagement.worker.ts`) that handles inactivity detection:

- Runs check every 6 hours via cron: `0 */6 * * *`
- Queries user's `last_interaction_at` timestamp
- If 48+ hours since last interaction, sends re-engagement message
- Runs automatically for all active users
- Can be scheduled/canceled per user

Usage:
```typescript
import { scheduleReengagementCheck } from './workers/reengagement.worker.js';

// Start monitoring when user signs up
await scheduleReengagementCheck('11987654321', 'João');

// Send message immediately (for testing)
import { sendReengagementMessageNow } from './workers/reengagement.worker.js';
await sendReengagementMessageNow('11987654321', 'João', 48);
```

### Queue Operations

#### Schedule Daily Summary

```typescript
import { scheduleDailySummary } from './workers/messaging.worker.js';

await scheduleDailySummary(
  '11987654321',  // Phone number
  '08:00',        // Time HH:MM
  {
    userName: 'João',
    remindersToday: ['Reunião às 14h', 'Pagar conta'],
    dailyBudget: 100,
    alreadySpent: 32.50,
    currency: 'BRL'
  }
);
```

Uses cron expression: `0 8 * * *` (every day at 8 AM)

#### Schedule Renewal Reminders

```typescript
import { scheduleRenewalReminders } from './workers/messaging.worker.js';

const expiryDate = new Date('2026-11-01');
await scheduleRenewalReminders(
  '11987654321',
  expiryDate,
  'João'  // optional: user name for personalization
);
```

Schedules 3 jobs automatically:
- At 7 days before expiry
- At 2 days before expiry
- At 1 day before expiry

#### Send Immediate Message

```typescript
import { sendImmediateMessage, MessageJobType } from './workers/messaging.worker.js';

await sendImmediateMessage(
  '11987654321',
  MessageJobType.WELCOME,
  {
    userName: 'João',
    daysAvailable: 30
  }
);
```

High priority, sent within seconds

#### Cancel Scheduled Messages

```typescript
import { cancelScheduledMessages } from './workers/messaging.worker.js';

await cancelScheduledMessages('11987654321');
```

Removes all scheduled jobs for a user

## Preferences API Endpoints

All endpoints require authentication.

### Get User Preferences

```http
GET /user/preferences
```

Response:
```json
{
  "success": true,
  "preferences": { ... },
  "timestamp": "2026-10-20T14:30:00Z"
}
```

### Update All Preferences

```http
PATCH /user/preferences

{
  "dailySummary": {
    "enabled": true,
    "time": "09:00"
  },
  "dailyBudget": 150,
  "reminders": {
    "renewalAlerts": true
  }
}
```

**Note**: Updating daily summary settings reschedules the cron job automatically.

### Quick: Update Daily Budget

```http
PATCH /user/preferences/budget

{ "dailyBudget": 200 }
```

Response:
```json
{
  "success": true,
  "message": "Orçamento diário atualizado para R$ 200,00",
  "dailyBudget": 200
}
```

### Quick: Update Daily Summary Time

```http
PATCH /user/preferences/summary-time

{ "time": "09:00" }
```

Automatically reschedules the daily summary job.

### Quick: Toggle Reminders

```http
PATCH /user/preferences/reminders

{
  "renewalAlerts": true,
  "taskReminders": false,
  "spendingAlerts": true
}
```

### Get Preferences Summary

```http
GET /user/preferences/summary
```

Quick read of key settings for UI display:
```json
{
  "dailySummaryEnabled": true,
  "dailySummaryTime": "08:00",
  "dailyBudget": 100,
  "renewalAlertsEnabled": true,
  "spendingAlertsEnabled": true,
  "quietHoursEnabled": false
}
```

## Evolution API Integration

Messages are sent via Evolution API (WhatsApp Business API).

### Configuration

Required environment variables:
```env
EVOLUTION_API_URL=https://evolution-api.com
EVOLUTION_API_KEY=your-api-key
```

In development/test, messages are logged instead of sent.

### Send Message Flow

1. Worker picks up job from queue
2. Generates message content via `userMessaging.service.ts`
3. Calls `evolution.sendMessage(phone, text)`
4. Evolution API sends WhatsApp message
5. Worker logs result and removes job from queue

## Database Integration (Future)

Currently preferences are mocked. Integration checklist:

- [ ] Create users table with:
  - `phone_number` (PK)
  - `name`
  - `created_at`
  - `expires_at` (subscription expiry)
  - `last_interaction_at` (for re-engagement checks)
  - `last_message_received_at` (for tracking)
  
- [ ] Create user_preferences table
  - Foreign key to users
  - All preference fields
  
- [ ] Create messaging_jobs table (or use Redis)
  - Track sent messages
  - Log delivery status
  
- [ ] Add migrations for schema

- [ ] Integrate database reads/writes into:
  - `getDefaultPreferences()` → fetch from DB
  - Preferences update endpoints → save to DB
  - Worker initialization → schedule from DB on startup
  - Re-engagement worker → query `last_interaction_at`
  - Update `last_interaction_at` on every user message
  
- [ ] Add foreign key constraints

- [ ] Add indexes on frequently queried fields:
  - `users.last_interaction_at` (for re-engagement checks)
  - `users.expires_at` (for renewal reminders)
  - `user_preferences.user_id` (for preference lookups)

## Testing

### Unit Tests

Message generation functions:
```typescript
import { generateDailySummary } from './userMessaging.service.js';

const message = generateDailySummary({
  userName: 'João',
  remindersToday: ['Task 1', 'Task 2'],
  dailyBudget: 100,
  alreadySpent: 50,
  currency: 'BRL'
});

expect(message).toContain('Bom dia');
expect(message).toContain('R$ 100,00');
```

### Integration Tests

Queue scheduling:
```typescript
import { scheduleDailySummary } from './workers/messaging.worker.js';

await scheduleDailySummary('11987654321', '08:00', {...});

// Verify job was added to queue
const jobs = await messagingQueue.getJobs();
expect(jobs.length).toBeGreaterThan(0);
```

## Error Handling

### Rate Limiting

Messages are rate-limited per user:
- 30 requests/minute
- 5 errors/minute
- Exceeded limits trigger alerts instead of failures

### Retry Logic

Failed deliveries:
- Exponential backoff (1s, 2s, 4s)
- 3 automatic retries
- Alert admin after 3 failures
- Message preserved in queue for manual retry

### Quiet Hours

If user has quiet hours enabled:
- Messages queued but not sent during quiet hours
- Delivered immediately after quiet hours end
- Configurable start/end times

## Development

### Local Testing

1. Ensure Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

2. Start server with workers:
```bash
npm run dev
```

3. Send test message:
```typescript
import { sendImmediateMessage, MessageJobType } from './workers/messaging.worker.js';

await sendImmediateMessage(
  '11987654321',
  MessageJobType.WELCOME,
  { userName: 'Test', daysAvailable: 30 }
);
```

4. Watch logs:
```bash
tail -f logs/INFO-*.log
```

### Mock Mode

In development, messages are logged to console instead of sent to WhatsApp. Check logs to verify message generation and queue operations.

## Performance Considerations

- **Cron jobs**: One per user for daily summary
- **Event-driven jobs**: On-demand for alerts/reminders
- **Job retention**: Jobs removed after successful delivery
- **Memory**: Redis holds job queue; messages are ephemeral
- **Scalability**: BullMQ handles thousands of concurrent jobs

## Security

- User phone numbers validated (Brazilian format)
- Preferences validation with Zod schema
- Auth required on all endpoints
- Evolution API key protected via environment variables
- Message content sanitized before sending
- No sensitive data in logs (phone masked when possible)
