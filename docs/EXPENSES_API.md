# Expenses API Documentation

Complete expense tracking system for Memo. Users can register expenses, view summaries by day/week/month, and track their budget.

## Overview

The expenses API provides:
- ✅ Register new expenses
- ✅ View expenses by time period (today, specific date, week, month)
- ✅ Calculate totals and averages
- ✅ Check daily budget compliance
- ✅ Group by categories
- ✅ Paginated expense history
- ✅ Delete expenses

**Base URL**: `/api`

**Authentication**: All endpoints require user authentication (phone number validation)

## Endpoints

### 1. Register Expense

**POST** `/api/expenses`

Register a new expense for the user.

**Request Body**:
```json
{
  "amount": 45.50,
  "description": "Almoço no restaurante",
  "category": "Alimentação"
}
```

**Parameters**:
- `amount` (number, required) - Expense amount in R$. Must be > 0 and ≤ 999,999.99
- `description` (string, required) - What was purchased (1-200 characters)
- `category` (string, optional) - Category name. Defaults to "Outros"

**Valid Categories**:
- Alimentação
- Transporte
- Saúde
- Compras
- Lazer
- Contas
- Trabalho
- Educação
- Outros

**Response** (200 OK):
```json
{
  "success": true,
  "expense": {
    "id": "exp_1729444800000_abc123def",
    "phoneNumber": "11987654321",
    "amount": 45.50,
    "description": "Almoço no restaurante",
    "category": "Alimentação",
    "date": "2026-10-20T14:00:00.000Z",
    "createdAt": "2026-10-20T14:00:00.000Z"
  },
  "message": "Gasto de R$ 45,50 registrado!",
  "timestamp": "2026-10-20T14:00:00.000Z"
}
```

**Errors**:
- 400 Bad Request: Invalid amount or description
- 401 Unauthorized: Not authenticated

---

### 2. Get Today's Expenses

**GET** `/api/expenses/today`

Get all expenses registered today with total.

**Response** (200 OK):
```json
{
  "success": true,
  "summary": {
    "date": "2026-10-20",
    "total": 125.50,
    "count": 3,
    "expenses": [
      {
        "id": "exp_1729444800000_abc123def",
        "phoneNumber": "11987654321",
        "amount": 45.50,
        "description": "Almoço no restaurante",
        "category": "Alimentação",
        "date": "2026-10-20T12:00:00.000Z",
        "createdAt": "2026-10-20T12:00:00.000Z"
      },
      {
        "id": "exp_1729448400000_def456ghi",
        "phoneNumber": "11987654321",
        "amount": 50.00,
        "description": "Uber",
        "category": "Transporte",
        "date": "2026-10-20T13:00:00.000Z",
        "createdAt": "2026-10-20T13:00:00.000Z"
      },
      {
        "id": "exp_1729452000000_ghi789jkl",
        "phoneNumber": "11987654321",
        "amount": 30.00,
        "description": "Café",
        "category": "Alimentação",
        "date": "2026-10-20T14:00:00.000Z",
        "createdAt": "2026-10-20T14:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

---

### 3. Get Expenses by Date

**GET** `/api/expenses/date/:date`

Get all expenses for a specific date (format: YYYY-MM-DD).

**Parameters**:
- `date` (string, URL param) - Date in YYYY-MM-DD format

**Example**: `GET /api/expenses/date/2026-10-15`

**Response**: Same format as "Today's Expenses"

---

### 4. Get Week Summary

**GET** `/api/expenses/week`

Get expenses summary for the last 7 days with breakdown by category.

**Response** (200 OK):
```json
{
  "success": true,
  "summary": {
    "period": "week",
    "startDate": "2026-10-13T00:00:00.000Z",
    "endDate": "2026-10-20T23:59:59.999Z",
    "total": 567.80,
    "count": 15,
    "average": 81.11,
    "byCategory": {
      "Alimentação": 250.00,
      "Transporte": 180.00,
      "Lazer": 100.00,
      "Outros": 37.80
    }
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

**Breakdown**:
- `total` - Sum of all expenses in the period
- `count` - Number of expenses
- `average` - Average daily spend (total / 7)
- `byCategory` - Total per category

---

### 5. Get Month Summary

**GET** `/api/expenses/month`

Get expenses summary for the current month.

**Response**: Same structure as week summary, but for the entire month

**Breakdown**:
- `average` - Average daily spend (total / days_in_month)

---

### 6. Check Daily Budget

**GET** `/api/expenses/budget-check?budget=100`

Check if user exceeded their daily budget.

**Query Parameters**:
- `budget` (number, optional) - Daily budget limit in R$

**Response** (200 OK):
```json
{
  "success": true,
  "check": {
    "exceeded": true,
    "spent": 125.50,
    "budget": 100.00,
    "remaining": 0,
    "percentageUsed": 125.5
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

**Without Budget**:
```json
{
  "exceeded": false,
  "spent": 0,
  "percentageUsed": 0
}
```

---

### 7. Get All Expenses (Paginated)

**GET** `/api/expenses?limit=50&offset=0`

Get all user's expenses with pagination.

**Query Parameters**:
- `limit` (number, optional) - Items per page. Max 100, default 50
- `offset` (number, optional) - Starting position. Default 0

**Response** (200 OK):
```json
{
  "success": true,
  "expenses": [
    {
      "id": "exp_1729452000000_ghi789jkl",
      "phoneNumber": "11987654321",
      "amount": 30.00,
      "description": "Café",
      "category": "Alimentação",
      "date": "2026-10-20T14:00:00.000Z",
      "createdAt": "2026-10-20T14:00:00.000Z"
    }
    // ... more expenses
  ],
  "total": 245,
  "limit": 50,
  "offset": 0,
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

**Pagination Example**:
- First page: `?limit=50&offset=0`
- Second page: `?limit=50&offset=50`
- Third page: `?limit=50&offset=100`

---

### 8. Get Top Categories

**GET** `/api/expenses/categories/top?limit=5`

Get user's top spending categories.

**Query Parameters**:
- `limit` (number, optional) - How many categories to return. Max 10, default 5

**Response** (200 OK):
```json
{
  "success": true,
  "topCategories": [
    {
      "category": "Alimentação",
      "total": 250.00,
      "percentage": 44.1
    },
    {
      "category": "Transporte",
      "total": 180.00,
      "percentage": 31.7
    },
    {
      "category": "Lazer",
      "total": 100.00,
      "percentage": 17.6
    },
    {
      "category": "Outros",
      "total": 37.80,
      "percentage": 6.6
    }
  ],
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

---

### 9. Delete Expense

**DELETE** `/api/expenses/:expenseId`

Delete a specific expense.

**Parameters**:
- `expenseId` (string, URL param) - ID of the expense to delete

**Example**: `DELETE /api/expenses/exp_1729452000000_ghi789jkl`

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Despesa deletada",
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

**Errors**:
- 404 Not Found: Expense doesn't exist
- 401 Unauthorized: Not authenticated

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid expense data",
    "details": {
      "errors": [
        "Valor deve ser maior que zero",
        "Descrição é obrigatória"
      ]
    }
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "User phone not found"
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Expense not found"
  },
  "timestamp": "2026-10-20T14:30:00.000Z"
}
```

---

## Examples

### Example 1: Register expense and check budget

```bash
# Register expense
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 45.50,
    "description": "Almoço",
    "category": "Alimentação"
  }'

# Check if exceeded budget
curl "http://localhost:3000/api/expenses/budget-check?budget=100"
```

### Example 2: Get today's summary

```bash
curl http://localhost:3000/api/expenses/today
```

### Example 3: Get week analysis

```bash
curl http://localhost:3000/api/expenses/week
```

### Example 4: Find top spending

```bash
curl "http://localhost:3000/api/expenses/categories/top?limit=3"
```

---

## Integration with Daily Summary

The daily summary message automatically includes:
- Total spent today
- Remaining budget
- Percentage of budget used
- Remaining available to spend

---

## Database Integration (TODO)

Currently expenses are stored in-memory. When database is ready:

1. Create `expenses` table:
```sql
CREATE TABLE expenses (
  id VARCHAR(255) PRIMARY KEY,
  phone_number VARCHAR(11) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (phone_number) REFERENCES users(phone_number) ON DELETE CASCADE,
  INDEX (phone_number, date),
  INDEX (phone_number, category)
);
```

2. Replace in-memory store with database queries
3. Add transaction support for budget calculations
4. Add soft delete support (archive old expenses)

---

## Rate Limiting

Expense endpoints are rate-limited to 100 requests per 15 minutes per user.

---

## Performance Notes

- Queries by date are optimized with date indexing
- Category grouping done in-memory after fetch
- Large result sets should use pagination (max 100 items per request)
- Consider caching week/month summaries
