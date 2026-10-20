# Memo Dashboard Redesign — Fasto-Inspired Professional SaaS

> **Objective:** Transform Memo's admin dashboard to match the visual quality and professional polish of Fasto, with a premium SaaS aesthetic, data-driven design, and elegant dark mode support.

**Status:** Design Spec (Architectural)  
**Date:** 2026-10-20  
**Approach:** Progressive Enhancement (Phase 1: Dashboard)

---

## Project Scope

### Phase 1: Dashboard Redesign (Priority)
- Redesign the main dashboard to Fasto visual standards
- Implement KPI cards with color indicators
- Refine charts and data visualization
- Add secondary sections (To-Do, Projects, Messages as cards/tabs)
- Improve header with search, notifications, profile
- Enhance sidebar navigation

### Phases 2+: Additional Pages (Later)
- Users management page
- Profile & Settings page
- (Projects and Messages pages deferred — no data backend yet)

---

## Visual Design System

### Color Palette
```
Primary: #2d5a3d (verde sofisticado)
Primary Light: #4a7c5a
Primary Hover: #1f4d2f

Accent Colors:
- Blue: #0066ff (KPI 1)
- Orange: #f59e0b (KPI 2)
- Green: #10b981 (KPI 3)
- Purple: #7c3aed (KPI 4)

Backgrounds (Light):
- Primary: #f8f9fb
- Secondary: #ffffff
- Tertiary: #f3f4f6
- Hover: #f0f1f4

Backgrounds (Dark):
- Primary: #0f1419
- Secondary: #1a202c
- Tertiary: #2d3748
- Hover: #374151

Text (Light):
- Primary: #0f172a
- Secondary: #64748b
- Tertiary: #94a3b8

Text (Dark):
- Primary: #f1f5f9
- Secondary: #cbd5e1
- Tertiary: #94a3b8

Borders:
- Light: #e2e8f0
- Dark: #334155

Status Colors:
- Success: #10b981
- Danger: #ef4444
- Warning: #f59e0b
```

### Typography
- Font Family: System fonts (-apple-system, BlinkMacSystemFont, Segoe UI)
- Sizes: xs(11px), sm(12px), base(13px), md(14px), lg(16px), xl(18px), 2xl(24px), 3xl(32px)
- Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Spacing Scale
- Base unit: 4px
- Scale: 2px, 4px, 6px, 8px, 12px, 16px, 20px, 24px, 28px, 32px, 40px, 48px

### Shadows
- sm: 0 1px 2px rgba(0,0,0,0.05)
- md: 0 4px 6px rgba(0,0,0,0.1)
- lg: 0 10px 15px rgba(0,0,0,0.1)
- xl: 0 20px 25px rgba(0,0,0,0.1)

### Border Radius
- sm: 6px
- md: 8px
- lg: 12px
- xl: 16px

---

## Dashboard Layout

### 1. Header (64px fixed)
**Components:**
- Left: Page title "Dashboard"
- Center: Search bar (300px wide, icon + input)
- Right: 
  - Theme toggle (circular button)
  - Notification badge (with dot indicator)
  - User avatar (36px circular) + dropdown menu
  - Admin name

**Styling:**
- Background: var(--color-bg-secondary)
- Border-bottom: 1px solid var(--color-border)
- Box-shadow: 0 1px 3px rgba(0,0,0,0.05)
- Sticky/fixed positioning

**Search Bar:**
- Input height: 36px
- Placeholder: "Search here..."
- Icon: magnifying glass (left aligned)
- Background: var(--color-bg-tertiary)
- On focus: border color = primary, subtle shadow

---

### 2. Sidebar (260px fixed left)
**Sections:**
```
┌─ BRANDING ─────────────────┐
│ [M] Memo                    │  ← Logo + text
│                             │
├─ NAVIGATION ────────────────┤
│ ≡ Dashboard           [●]   │  ← Active indicator (left 3px bar)
│ 👥 Usuários                 │
│ 👤 Perfil                   │
│ ⚙️ Configurações             │
│                             │
├─ FOOTER ───────────────────┤
│ [🌙] [🔐] Sair              │
└─────────────────────────────┘
```

**Styling:**
- Background: var(--color-primary)
- Text: white with opacity levels
- Nav items: 40px height, 10px padding vertical
- Active state: left border 3px white + subtle background
- Hover: background rgba(255,255,255,0.15)
- Responsive: 260px desktop → 220px tablet → 180px mobile

---

### 3. KPI Cards Grid (4 columns responsive)
**Each Card:**
```
┌────── COLOR BAR (3px) ──────┐
│                              │
│ 📊 Ícone     Valor: 1,234    │
│ Label                        │
│ ↑ 12% vs período anterior    │
│                              │
└──────────────────────────────┘
```

**Card Details:**
- Width: 1/4 of container (responsive)
- Height: auto (~120px)
- Background: var(--color-bg-secondary)
- Border: 1px solid var(--color-border)
- Border-radius: 12px
- Padding: 20px
- Shadow: 0 1px 2px (hover: 0 10px 15px)
- Hover: translateY(-2px), border color lighter

**Color bars (top 3px):**
1. KPI 1 (Total Usuários): #0066ff
2. KPI 2 (Novos): #f59e0b
3. KPI 3 (Mensagens): #10b981
4. KPI 4 (Tokens): #7c3aed

**Icons (32x32):**
- Background: rgba(color, 0.1)
- Color: match bar color
- Emoji or simple SVG

**Value formatting:**
- Font-size: 32px, weight: 700
- Color: var(--color-text-primary)
- Format: comma-separated (1,234)

**Change indicator:**
- Font-size: 12px
- Color: #10b981 (green for positive)
- Format: "↑ 12% vs período anterior"

**Data source:** Real analytics endpoints (/admin/analytics/users, messages, tokens)

---

### 4. Filters Section (below header, compact)
**Layout:**
```
Período: [7d] [30d] [90d] [Personalizado ▼]
```

**Styling:**
- Display: flex, gap: 8px
- Button height: 32px
- Background: var(--color-bg-tertiary)
- Active button: background primary, color white
- Hover: background lighter
- Font-size: 13px

**Functionality:**
- Clicking 7d/30d/90d: reload analytics with new day range
- Clicking "Personalizado": show date range picker (from/to)
- Applied filter shows in header or subtitle

---

### 5. Charts Grid (2 columns, responsive)
**Layout:**
```
┌─ Evolução de Usuários ─────┐  ┌─ Mensagens Processadas ──┐
│                            │  │                          │
│     [Line Chart]           │  │     [Bar Chart]          │
│                            │  │                          │
│ Jan    Feb    Mar          │  │ Jan    Feb    Mar        │
└────────────────────────────┘  └──────────────────────────┘

┌─ Tokens Consumidos ────────┐  ┌─ Gastos ───────────────┐
│                            │  │                        │
│     [Line Chart]           │  │   [Line Chart]         │
│                            │  │                        │
│ Jan    Feb    Mar          │  │ Jan    Feb    Mar      │
└────────────────────────────┘  └────────────────────────┘
```

**Card Styling:**
- Background: var(--color-bg-secondary)
- Border: 1px solid var(--color-border)
- Border-radius: 12px
- Padding: 20px
- Height: 280px
- Shadow: var(--shadow-sm)
- Responsive: 2 cols desktop → 1 col tablet/mobile

**Chart Title:**
- Font-size: 16px, weight: 600
- Margin-bottom: 16px
- Color: var(--color-text-primary)

**Chart Container:**
- Height: 240px
- Background: var(--color-bg-tertiary)
- Border-radius: 8px

**Chart Styling (Chart.js):**
- Line charts: smooth tension (0.4), fill with 0.05 opacity
- Bar charts: rounded corners, 4px border-radius
- Tooltips: dark background, white text
- Legends: hidden by default
- Grid: subtle rgba(0,0,0,0.05)
- Responsive: true

**Empty State:**
- Message: "Sem dados para o período"
- Color: var(--color-text-tertiary)
- Font-size: 12px
- Centered in container

---

### 6. Secondary Sections (below charts)

#### 6A. Quick To-Do List
**Layout:**
```
┌─ Quick To-Do List ───────────────┐
│ [+] Add task                     │
│                                  │
│ ☐ Review new users               │
│ ☐ Check token usage              │
│ ☐ Update admin docs              │
│                                  │
└──────────────────────────────────┘
```

**Card Styling:** Same as chart cards (12px radius, border, padding)

**To-Do Items:**
- Checkbox (left) + text (flex 1)
- Height: 40px
- Border-bottom: 1px solid var(--color-border-light)
- Hover: background var(--color-bg-tertiary)
- Checked: strikethrough + opacity 0.5

**Data Source:** MOCK for now (hardcoded tasks for design reference)

#### 6B. Upcoming Projects
**Layout:**
```
┌─ Upcoming Projects ──────────────┐
│                                  │
│ 📱 Redesign Mobile App           │
│    Next week • High Priority     │
│                                  │
│ 📊 Analytics Upgrade             │
│    Next month • Medium Priority  │
│                                  │
└──────────────────────────────────┘
```

**Card Styling:** Same as primary cards

**Project Items:**
- Icon (24px) + content (flex 1)
- Heading: 14px, weight 600
- Date + priority: 12px, color secondary
- Padding: 12px vertical
- Border-bottom: 1px divider

**Data Source:** MOCK for now

#### 6C. Recent Messages
**Layout:**
```
┌─ Recent Messages ────────────────┐
│                                  │
│ 👤 João Silva       5 min ago    │
│    Usuário ativado com sucesso   │
│                                  │
│ 👤 Maria Santos     1 hour ago   │
│    Token limit reached           │
│                                  │
└──────────────────────────────────┘
```

**Card Styling:** Same as primary cards

**Message Items:**
- Avatar (32px) + content (flex 1) + timestamp (right)
- Avatar: circular, background gradient primary
- Message text: 13px
- Timestamp: 12px, color tertiary
- Padding: 12px vertical
- Border-bottom: 1px divider

**Data Source:** Real message_logs table (LIMIT 5, ORDER BY created_at DESC)

---

## Responsive Breakpoints

### Desktop (1920px+)
- Sidebar: 260px
- Header: 64px
- KPI Grid: 4 columns
- Charts: 2 columns
- Main padding: 32px

### Laptop (1366px)
- Sidebar: 260px
- KPI Grid: 4 columns
- Charts: 2 columns
- Main padding: 24px

### Tablet (768px)
- Sidebar: 220px
- Header: 56px
- KPI Grid: 2 columns
- Charts: 1 column
- Main padding: 16px
- Search bar: hidden (icon only)

### Mobile (480px)
- Sidebar: 150px (icons only, text hidden)
- Header: 52px
- KPI Grid: 1 column
- Charts: 1 column
- Main padding: 12px
- Secondary sections: 1 column

---

## Dark Mode Implementation

**Strategy:** Use CSS custom properties with `html[data-theme="dark"]` attribute

**Toggle:**
- Location: Header right
- Icon: Moon/Sun SVG
- Storage: localStorage (key: "memo-theme")
- Default: "light"

**All colors automatically update** via CSS variables when `data-theme="dark"` is set

---

## Data Sources & Real Integration

### KPI Data
- **Total Usuários:** COUNT(*) FROM users
- **Novos (período):** COUNT(*) FROM users WHERE created_at > now() - interval
- **Mensagens:** COUNT(*) FROM message_logs WHERE created_at > now() - interval
- **Tokens:** SUM(tokens_consumed) FROM token_usage WHERE created_at > now() - interval

**Endpoints:** `/admin/analytics/users`, `/admin/analytics/messages`, `/admin/analytics/tokens`, `/admin/analytics/expenses`

### Chart Data
- **Evolução Usuários:** GROUP BY DATE(created_at), cumulative count
- **Mensagens:** GROUP BY DATE(created_at), count
- **Tokens:** GROUP BY DATE(created_at), sum
- **Gastos:** GROUP BY DATE(created_at), sum

### Recent Messages
- **Source:** message_logs table
- **Query:** SELECT * FROM message_logs ORDER BY created_at DESC LIMIT 5
- **Display:** phone_number, message_text, created_at

### Secondary Sections (MOCK for now)
- Quick To-Do: Hardcoded 3-4 items
- Upcoming Projects: Hardcoded 2-3 items
- (Can be replaced with real data later if schema created)

---

## Components Library

### Reusable Components
1. **KPI Card** — with color bar, icon, value, change
2. **Chart Card** — with title, chart container, empty state
3. **Section Card** — for To-Do, Projects, Messages
4. **Nav Link** — sidebar with active indicator
5. **Filter Button** — period selector
6. **Theme Toggle** — moon/sun button

---

## Implementation Order

1. Update CSS design system (colors, spacing, shadows, radius)
2. Refine HTML structure (header, sidebar, content layout)
3. Implement KPI cards with real data
4. Implement chart cards with real data
5. Add secondary sections (To-Do, Projects, Messages)
6. Implement dark mode toggle
7. Test responsiveness at 4 breakpoints
8. Verify data loading and edge cases

---

## Success Criteria

✅ Dashboard matches Fasto visual quality  
✅ All KPIs display real data from analytics endpoints  
✅ Charts render correctly with proper styling  
✅ Dark mode works seamlessly  
✅ Fully responsive (mobile to desktop)  
✅ Secondary sections display (mock or real data)  
✅ Performance: load time < 2s  
✅ All existing functionality preserved  

---

## Files to Modify/Create

- `admin/styles.css` — enhance design system
- `admin/index.html` — restructure layout, add secondary sections
- `admin/dashboard.js` — improve data loading, chart rendering
- `admin/app.js` — maintain existing functionality
- `migrations/` — (defer) if adding Tasks/Projects data

---

## Deferred Decisions

- **Projects & Messages pages:** Will create after Dashboard Phase 1 is complete
- **Tasks/To-Do backend:** Can use mock data for initial design, integrate real data later
- **Advanced filtering:** Date range picker logic can be enhanced later
- **Notifications system:** Backend infrastructure can be added later

