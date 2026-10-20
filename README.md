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

```bash
git clone <repo>
cd memo
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `CLAUDE_API_KEY` - Claude API key (from Anthropic)
- `EVOLUTION_INSTANCE` - Your Evolution API instance
- `EVOLUTION_API_KEY` - Your Evolution API key
- `ADMIN_PASSWORD` - Admin login password

### 3. Database Setup

Run migrations:

```bash
npm run migrate
```

### 4. Run Locally

Development mode with hot reload:

```bash
npm run dev
```

Server starts on `http://localhost:3000`

Access admin panel: `http://localhost:3000/admin/index.html`

## API Endpoints

### Webhook

**POST** `/webhook`  
Evolution API webhook endpoint. Receives WhatsApp messages.

### Admin

**POST** `/admin/auth`  
Login with admin password. Returns JWT token.

```bash
curl -X POST http://localhost:3000/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"password": "your_password"}'
```

**GET** `/admin/whitelist`  
List all authorized users.

**POST** `/admin/whitelist`  
Add user to whitelist.

```bash
curl -X POST http://localhost:3000/admin/whitelist \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "11999999999",
    "permitted_until": "2026-12-31"
  }'
```

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

```bash
npm test
```

Run integration tests:

```bash
npm run test:integration
```

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
