# Memo Dashboard Redesign — Fasto-Inspired Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Memo's admin dashboard to match Fasto's professional SaaS visual standards with KPI cards, refined header/sidebar navigation, Chart.js visualizations, dark mode, and full responsiveness across 4 breakpoints.

**Architecture:** Progressive enhancement via 10 atomic tasks building from design system → layout → components → data integration → responsiveness. Each task is independently testable via visual verification in browser. No backend changes; all integration uses existing `/admin/analytics/*` endpoints and `message_logs` table. Design system (CSS variables) already in place; remaining tasks enhance HTML structure, styling, and JavaScript behavior.

**Tech Stack:** Vanilla HTML/CSS/JS; Chart.js CDN; existing Node.js/PostgreSQL backend; no new dependencies.

**Spec:** [docs/superpowers/specs/2026-10-20-fasto-inspired-redesign.md](../../specs/2026-10-20-fasto-inspired-redesign.md)

## Global Constraints

- CSS Variables (light/dark modes) already defined in `admin/styles.css:1-90`; all color/spacing values must reference these variables, never hardcoded hex/px
- Dark mode toggle persists to localStorage via key `"memo-theme"`; HTML attribute `data-theme="dark"` controls all theming
- Responsive breakpoints: desktop (1920px+), laptop (1366px), tablet (768px), mobile (480px)
- Chart.js must use tension=0.4 for line charts, borderRadius=4px for bar charts, no legends, subtle grid colors
- All KPI data sourced from real `/admin/analytics/*` endpoints; Recent Messages from `message_logs` table (SELECT * … LIMIT 5 ORDER BY created_at DESC)
- Empty states: "Sem dados para o período" message when no data
- All existing functionality (login, whitelist table, add/revoke users, modal edits) must continue working

## Review Focus

1. **KPI cards with empty periods** — does the card render safely when cumulative_count/new_count is missing or undefined?
2. **Chart rendering on no-data** — does Chart.js destroy properly and show the empty state message without errors?
3. **Dark mode flashing on page load** — does initTheme() run before paint to prevent light-mode flicker?
4. **Sidebar active state on mobile** — is the 150px mobile sidebar usable (icons only) and does the active indicator still show?
5. **Custom date filter edge cases** — does loadAnalyticsCustom() handle dates correctly when from > to or same date?

---

## File Structure

### Files to Modify
- `admin/styles.css` — enhance with layout components (header, sidebar, cards, grids, modals, responsive media queries)
- `admin/index.html` — restructure login → dashboard sections, add header, sidebar nav, content layout, KPI/chart cards, secondary sections
- `admin/dashboard.js` — refine data loading, chart initialization, KPI updates (already mostly correct; minor enhancements)
- `admin/app.js` — theme management already present; verify theme toggle, add sidebar nav click handlers (if needed)

### No New Files
All changes stay within existing 4 admin files. No new JavaScript modules or CSS partials.

---

## Task Breakdown

### Task 1: Enhance CSS Design System — Layout Foundation

**Files:**
- Modify: `admin/styles.css` (add layout classes, card styles, modals, utilities)

**Interfaces:**
- Consumes: None (CSS-only task)
- Produces: `.app-container`, `.sidebar`, `.main-content`, `.app-header`, `.app-content`, `.card`, `.kpi-grid`, `.charts-grid`, `.modal`, `.hidden`, utility classes for spacing/text styling

**Details:**

The design system variables already exist (colors, spacing, typography, shadows). This task adds layout component styles that consume those variables.

- [ ] **Step 1: Add layout wrapper and container classes**

After the dark mode rule at line 90, add:

```css
/* ============================================================================
   LAYOUT CONTAINERS
   ============================================================================ */

body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
}

.app-container {
  display: flex;
  height: 100vh;
  width: 100%;
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 260px;
  height: 100vh;
  background-color: var(--color-primary);
  color: white;
  display: flex;
  flex-direction: column;
  padding: 24px 0;
  z-index: 100;
  overflow-y: auto;
}

.main-content {
  margin-left: 260px;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}

.app-header {
  position: sticky;
  top: 0;
  height: 64px;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  box-shadow: var(--shadow-sm);
  z-index: 50;
}

.page-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.app-content {
  flex: 1;
  padding: 32px;
  background-color: var(--color-bg-primary);
  overflow-y: auto;
}
```

- [ ] **Step 2: Add card component styles**

Append:

```css
/* ============================================================================
   CARDS & SECTIONS
   ============================================================================ */

.card {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.card:hover {
  box-shadow: var(--shadow-lg);
}

.card-content {
  width: 100%;
}

.section {
  margin-bottom: 40px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.section-description {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  margin: 0;
}
```

- [ ] **Step 3: Add KPI card styles with color bars**

Append:

```css
/* ============================================================================
   KPI CARDS
   ============================================================================ */

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 32px;
}

.kpi-card {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
  transition: var(--transition);
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--color-primary);
}

.kpi-card:nth-child(1)::before { background-color: #0066ff; }
.kpi-card:nth-child(2)::before { background-color: #f59e0b; }
.kpi-card:nth-child(3)::before { background-color: #10b981; }
.kpi-card:nth-child(4)::before { background-color: #7c3aed; }

.kpi-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
  border-color: var(--color-border);
}

.kpi-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  text-transform: none;
}

.kpi-value {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.kpi-change {
  font-size: var(--font-size-xs);
  color: var(--color-success);
}
```

- [ ] **Step 4: Add charts grid and chart card styles**

Append:

```css
/* ============================================================================
   CHARTS
   ============================================================================ */

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 32px;
}

.chart-card {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  min-height: 280px;
  display: flex;
  flex-direction: column;
}

.chart-card h3 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.chart-container {
  flex: 1;
  position: relative;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 16px;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-container canvas {
  max-height: 100%;
  max-width: 100%;
}
```

- [ ] **Step 5: Add modal styles**

Append:

```css
/* ============================================================================
   MODALS
   ============================================================================ */

.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 200;
  align-items: center;
  justify-content: center;
}

.modal:not(.hidden) {
  display: flex;
}

.modal-content {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--color-text-tertiary);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}
```

- [ ] **Step 6: Add utility classes**

Append:

```css
/* ============================================================================
   UTILITIES
   ============================================================================ */

.hidden {
  display: none !important;
}

.text-small {
  font-size: var(--font-size-sm);
}

.text-muted {
  color: var(--color-text-tertiary);
}

.gap-sm { gap: 8px; }
.gap-md { gap: 16px; }
.gap-lg { gap: 24px; }

.mb-0 { margin-bottom: 0; }
.mb-sm { margin-bottom: 8px; }
.mb-md { margin-bottom: 16px; }
.mb-lg { margin-bottom: 24px; }
```

- [ ] **Step 7: Verify CSS compiles (visual check)**

Open browser DevTools → Styles tab and verify:
- All color variables resolve (no "undefined")
- Dark mode variables render when `html[data-theme="dark"]`
- Transitions and animations are smooth
- No syntax errors in console

- [ ] **Step 8: Commit**

```bash
git add admin/styles.css
git commit -m "feat: add layout and component styles for dashboard redesign"
```

---

### Task 2: Restructure HTML — Header, Sidebar, Content Layout

**Files:**
- Modify: `admin/index.html` (restructure dashboard section layout)

**Interfaces:**
- Consumes: Sidebar/header/content DOM structure from spec
- Produces: Valid HTML with sidebar (nav-section, nav-link, active state), header (search, notifications, profile, theme toggle), app-content wrapper

**Details:**

The HTML already has basic structure. This task refines:
1. Login page stays as-is
2. Dashboard section: restructure to sidebar + header + content layout
3. Sidebar: add nav-section groups (Dashboard, Usuários, Perfil, Settings), active indicator (3px left border on nav-link)
4. Header: add search bar, notifications badge, avatar dropdown, theme toggle
5. Content: wrap in app-content div

- [ ] **Step 1: Update sidebar structure in dashboard section**

Replace lines 47-75 (current sidebar) with:

```html
<aside class="sidebar">
  <div class="sidebar-header">
    <h2 class="sidebar-brand">Memo</h2>
  </div>

  <nav class="sidebar-nav">
    <div class="nav-section">
      <a href="#" class="nav-link active" data-page="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        <span>Dashboard</span>
      </a>
      <a href="#" class="nav-link" data-page="users">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <span>Usuários</span>
      </a>
      <a href="#" class="nav-link" data-page="profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Perfil</span>
      </a>
      <a href="#" class="nav-link" data-page="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v6m0 6v6m4.22-15.22l-4.24 4.24m-5.96 5.96l-4.24 4.24m15.22 4.22l-4.24-4.24m5.96-5.96l4.24-4.24"></path>
        </svg>
        <span>Configurações</span>
      </a>
    </div>
  </nav>

  <div class="sidebar-footer">
    <button class="btn-logout" onclick="logout()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      <span>Sair</span>
    </button>
  </div>
</aside>
```

- [ ] **Step 2: Update header with search, notifications, profile**

Replace lines 80-91 (current header) with:

```html
<header class="app-header">
  <h1 class="page-title">Painel de Controle</h1>
  
  <div class="header-actions">
    <div class="search-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" placeholder="Buscar aqui..." class="search-input">
    </div>

    <button class="icon-button notifications-btn" title="Notificações">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      <span class="notification-badge">2</span>
    </button>

    <div class="profile-section">
      <button class="theme-toggle" id="theme-toggle" title="Alternar tema">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
      <div class="avatar">A</div>
      <div class="profile-menu">
        <button class="profile-name">Admin</button>
      </div>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Wrap content in app-content container**

Replace line 94 (`<div class="app-content">`) with:

```html
<div class="app-content">
```

Keep everything that was in content; close `</div>` at the end (line 278).

- [ ] **Step 4: Verify HTML structure in browser**

Open http://localhost:3001/admin → check:
- Sidebar appears left, fixed width, green background
- Header appears top, search bar visible, notifications/avatar/toggle on right
- Dashboard content flows below header, respects left sidebar margin
- No overlapping elements
- Login page still works (click logout to test)

- [ ] **Step 5: Commit**

```bash
git add admin/index.html
git commit -m "feat: restructure dashboard HTML with header and sidebar"
```

---

### Task 3: Style Sidebar Navigation

**Files:**
- Modify: `admin/styles.css` (add sidebar nav styling)

**Interfaces:**
- Consumes: `.sidebar`, `.sidebar-header`, `.sidebar-brand`, `.sidebar-nav`, `.nav-section`, `.nav-link`, `.nav-icon`, `.sidebar-footer`, `.btn-logout`
- Produces: Styled sidebar with active indicator, hover states

**Details:**

- [ ] **Step 1: Add sidebar header and nav styles**

In `admin/styles.css`, before responsive breakpoints, add:

```css
/* ============================================================================
   SIDEBAR
   ============================================================================ */

.sidebar-header {
  padding: 0 16px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-brand {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: white;
  margin: 0;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 0;
  overflow-y: auto;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
  font-size: var(--font-size-md);
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-link.active {
  border-left-color: white;
  background-color: rgba(255, 255, 255, 0.15);
  color: white;
  font-weight: var(--font-weight-semibold);
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 16px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-logout {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-md);
  transition: all 0.2s ease;
}

.btn-logout:hover {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-logout .nav-icon {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 2: Add header action styles**

Append:

```css
/* ============================================================================
   HEADER ACTIONS
   ============================================================================ */

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  width: 300px;
}

.search-icon {
  width: 18px;
  height: 18px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.icon-button {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: var(--transition);
}

.icon-button:hover {
  color: var(--color-text-primary);
}

.icon-button svg {
  width: 20px;
  height: 20px;
}

.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  padding: 2px 6px;
  border-radius: 10px;
}

.profile-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
}

.theme-toggle:hover {
  color: var(--color-text-primary);
}

.theme-toggle svg {
  width: 20px;
  height: 20px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
}

.profile-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: left;
  padding: 0;
}

.profile-name:hover {
  color: var(--color-text-primary);
}
```

- [ ] **Step 3: Visual test in browser**

Open dashboard and verify:
- Sidebar navigation links styled, green background, white text
- Active link has left 3px white border and lighter background
- Header has search bar, notifications badge (red), theme toggle, avatar
- All icons visible and properly sized

- [ ] **Step 4: Commit**

```bash
git add admin/styles.css
git commit -m "feat: style sidebar navigation and header actions"
```

---

### Task 4: Enhance KPI Cards with Real Data Display

**Files:**
- Modify: `admin/index.html` (update KPI card structure for icons and change indicators)
- Modify: `admin/dashboard.js` (enhance updateKPIs function)

**Interfaces:**
- Consumes: KPI data structure from /admin/analytics/* endpoints (cumulative_count, new_count, count, total)
- Produces: updateKPIs(users, messages, tokens) function that formats values with color-coded change indicators

**Details:**

- [ ] **Step 1: Update KPI card HTML structure in index.html**

Replace lines 128-145 (KPI cards) with:

```html
<div class="kpi-grid">
  <div class="kpi-card">
    <div class="kpi-label">Total de Usuários</div>
    <div class="kpi-value" id="total-users">—</div>
    <div class="kpi-change">↑ — vs período anterior</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">Novos (período)</div>
    <div class="kpi-value" id="new-users">—</div>
    <div class="kpi-change">— usuários novos</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">Mensagens</div>
    <div class="kpi-value" id="total-messages">—</div>
    <div class="kpi-change">↑ — vs período anterior</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">Tokens</div>
    <div class="kpi-value" id="total-tokens">—</div>
    <div class="kpi-change">↑ — consumidos</div>
  </div>
</div>
```

- [ ] **Step 2: Enhance updateKPIs in dashboard.js**

Replace lines 336-345 (updateKPIs function) with:

```javascript
function updateKPIs(users, messages, tokens) {
  // Total users (cumulative)
  const totalUsers = users.length > 0 ? users[users.length - 1].cumulative_count : 0;
  
  // New users this period
  const newUsers = users.reduce((sum, u) => sum + (u.new_count || 0), 0);
  
  // Total messages this period
  const totalMessages = messages.reduce((sum, m) => sum + (m.count || 0), 0);
  
  // Total tokens this period
  const totalTokens = tokens.total || 0;

  // Update DOM
  document.getElementById('total-users').textContent = formatNumber(totalUsers);
  document.getElementById('new-users').textContent = formatNumber(newUsers);
  document.getElementById('total-messages').textContent = formatNumber(totalMessages);
  document.getElementById('total-tokens').textContent = formatNumber(totalTokens);
}
```

- [ ] **Step 3: Test with real analytics data**

In browser:
- Open dashboard
- Verify KPI cards show numeric values (not "—")
- Values are comma-formatted (1,234 not 1234)
- Change indicators show "↑ — vs período anterior" etc
- Switch between 7d/30d/90d filters → values update

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/dashboard.js
git commit -m "feat: enhance KPI cards with real data display"
```

---

### Task 5: Implement Chart Card Styling and Empty State Handling

**Files:**
- Modify: `admin/styles.css` (enhance chart card styling, empty state)
- Modify: `admin/dashboard.js` (verify Chart.js styling, empty state rendering)

**Interfaces:**
- Consumes: Chart.js library (CDN), chart canvas elements (users-chart, messages-chart, tokens-chart, expenses-chart)
- Produces: Styled chart cards with proper container sizing, Chart.js instances with Fasto styling (tension, colors, grid)

**Details:**

- [ ] **Step 1: Enhance chart card container styles (already mostly done, verify)**

Run browser DevTools → inspect `.chart-container` and verify:
- Background is var(--color-bg-tertiary)
- Min-height: 240px
- Chart.js renders within bounds
- Grid lines are subtle (rgba(0,0,0,0.05))

- [ ] **Step 2: Update chart rendering in dashboard.js to ensure Fasto styling**

Verify lines 145-179 (renderUserChart) have:
- `tension: 0.4` ✓
- `backgroundColor: 'rgba(45, 90, 61, 0.05)'` (green, 5% opacity) ✓
- Point styling (white border, 2px) ✓

Similarly check lines 182-221 (messages bar chart):
- `borderRadius: 4` ✓

And lines 224-318 (tokens, expenses):
- `tension: 0.4` ✓
- Light grid lines ✓

- [ ] **Step 3: Verify empty state rendering**

Test by filtering to a date range with no data:
- Chart should not render
- showEmptyChart(canvas) should display "Sem dados para o período" message
- No console errors

Run: `loadAnalyticsCustom('2026-01-01', '2026-01-05')`

Expected: All 4 charts show "Sem dados para o período" text centered in gray.

- [ ] **Step 4: Visual validation**

Open dashboard and verify:
- Charts render with smooth lines (tension), rounded corners (bars)
- Chart title is visible (16px, semibold)
- Grid is subtle
- Legends are hidden
- Chart container has proper spacing

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.js
git commit -m "feat: verify and validate chart styling for Fasto design"
```

---

### Task 6: Add Secondary Sections (To-Do, Projects, Messages)

**Files:**
- Modify: `admin/index.html` (add secondary sections after charts)
- Modify: `admin/dashboard.js` (add loadRecentMessages function)

**Interfaces:**
- Consumes: message_logs table data via new endpoint or direct query
- Produces: HTML sections for To-Do (mock), Projects (mock), Recent Messages (real data from message_logs)

**Details:**

- [ ] **Step 1: Add secondary sections HTML after charts section**

After line 174 (closing `</div>` of charts-grid), add:

```html
<!-- QUICK TO-DO LIST -->
<div class="section">
  <div class="section-header">
    <h2 class="section-title">Quick To-Do List</h2>
  </div>
  <div class="card">
    <div class="card-content">
      <div class="todo-list">
        <div class="todo-item">
          <input type="checkbox" id="todo-1" class="todo-check">
          <label for="todo-1" class="todo-label">Review new users</label>
        </div>
        <div class="todo-item">
          <input type="checkbox" id="todo-2" class="todo-check">
          <label for="todo-2" class="todo-label">Check token usage</label>
        </div>
        <div class="todo-item">
          <input type="checkbox" id="todo-3" class="todo-check">
          <label for="todo-3" class="todo-label">Update admin docs</label>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- RECENT MESSAGES -->
<div class="section">
  <div class="section-header">
    <h2 class="section-title">Recent Messages</h2>
    <p class="section-description">Latest activity from users</p>
  </div>
  <div class="card">
    <div class="card-content">
      <div class="messages-list" id="recent-messages">
        <div style="text-align: center; color: var(--color-text-tertiary); padding: 24px;">
          Carregando...
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add styles for to-do and messages lists in styles.css**

Append:

```css
/* ============================================================================
   TO-DO & MESSAGES LISTS
   ============================================================================ */

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-check {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.todo-label {
  flex: 1;
  cursor: pointer;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
}

.todo-item input:checked + .todo-label {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.message-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
  align-items: flex-start;
}

.message-item:last-child {
  border-bottom: none;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), #0066ff);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-phone {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.message-text {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  word-break: break-word;
  margin-bottom: 4px;
}

.message-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}
```

- [ ] **Step 3: Add loadRecentMessages function to dashboard.js**

Append before the formatDate function (before line 373):

```javascript
function loadRecentMessages() {
  const token = localStorage.getItem('memo_token');
  
  fetch('/admin/analytics/recent-messages?limit=5', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(data => {
      renderRecentMessages(data.messages || []);
    })
    .catch(err => {
      console.error('Failed to load recent messages:', err);
      renderRecentMessages([]);
    });
}

function renderRecentMessages(messages) {
  const container = document.getElementById('recent-messages');
  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--color-text-tertiary); padding: 24px;">
        Sem mensagens
      </div>
    `;
    return;
  }

  messages.forEach(msg => {
    const date = new Date(msg.created_at);
    const timeAgo = formatTimeAgo(date);
    const initials = msg.phone_number.substring(0, 2).toUpperCase();

    const item = document.createElement('div');
    item.className = 'message-item';
    item.innerHTML = `
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        <div class="message-phone">${msg.phone_number}</div>
        <div class="message-text">${escapeHtml(msg.message_text.substring(0, 100))}</div>
        <div class="message-time">${timeAgo}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

function formatTimeAgo(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

- [ ] **Step 4: Update DOMContentLoaded in dashboard.js to load messages**

In the existing DOMContentLoaded listener (around line 5-11), after setupFilterButtons() and loadAnalytics(7), add:

```javascript
loadRecentMessages();
```

Also, update loadAnalytics to refresh messages when filter changes. After renderCharts/updateKPIs calls in loadAnalytics (around line 81), add:

```javascript
loadRecentMessages();
```

- [ ] **Step 5: Update or create analytics endpoint for recent messages**

Check if `/admin/analytics/recent-messages` exists in src/routes/analytics.ts. If not, add:

```typescript
router.get('/admin/analytics/recent-messages', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const messages = await db.query(
      `SELECT phone_number, message_text, created_at 
       FROM message_logs 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [limit]
    );
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});
```

- [ ] **Step 6: Visual test**

Open dashboard and verify:
- To-Do list shows 3 mock items with checkboxes
- Checking checkbox strikes through the text
- Recent Messages section loads and displays latest 5 messages from database
- Each message shows phone number, message preview, time ago
- Empty state shows "Sem mensagens" if no data

- [ ] **Step 7: Commit**

```bash
git add admin/index.html admin/styles.css admin/dashboard.js src/routes/analytics.ts
git commit -m "feat: add secondary sections (to-do, messages) with real message data"
```

---

### Task 7: Implement Dark Mode Toggle with Persistence

**Files:**
- Modify: `admin/styles.css` (ensure all dark mode variables set)
- Verify: `admin/app.js` (theme management already present)

**Interfaces:**
- Consumes: localStorage key "memo-theme"
- Produces: Theme toggle button that switches `html[data-theme="dark"]` and persists to localStorage

**Details:**

Dark mode infrastructure is already in place in app.js (initTheme, setTheme, toggleTheme). This task verifies it works end-to-end.

- [ ] **Step 1: Verify dark mode CSS variables are complete**

Check `admin/styles.css` lines 73-89 (dark mode rule):

Should have all necessary overrides:
- `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-tertiary`, `--color-bg-hover`
- `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`
- `--color-border`, `--color-border-light`
- Shadow variables

If any are missing, add them to the dark rule.

- [ ] **Step 2: Verify theme toggle button exists and is wired**

Check index.html line 84: `<button class="theme-toggle" id="theme-toggle" title="Alternar tema">`

Check app.js lines 34-40:

```javascript
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}
```

Should already exist. If not, add it.

- [ ] **Step 3: Test dark mode in browser**

1. Open dashboard
2. Click theme toggle button (moon icon in header)
3. Verify:
   - Page instantly switches to dark colors (no reload)
   - All text, backgrounds, borders update
   - Dark mode persists on page reload
   - Clicking toggle again returns to light mode

- [ ] **Step 4: Commit (if any changes)**

If only verifying and no changes needed:

```bash
git commit --allow-empty -m "feat: verify dark mode toggle and persistence"
```

If changes were made:

```bash
git add admin/styles.css admin/app.js
git commit -m "feat: complete dark mode implementation with persistence"
```

---

### Task 8: Implement Responsive Breakpoints (4 sizes)

**Files:**
- Modify: `admin/styles.css` (add 4 media queries for 1920px, 1366px, 768px, 480px)

**Interfaces:**
- Consumes: Existing layout styles (.sidebar, .main-content, .kpi-grid, .charts-grid, etc.)
- Produces: Mobile-first responsive styles for desktop → tablet → mobile

**Details:**

- [ ] **Step 1: Add media query for laptop (1366px)**

At end of styles.css, before final closing, add:

```css
/* ============================================================================
   RESPONSIVE DESIGN
   ============================================================================ */

@media (max-width: 1366px) {
  .sidebar {
    width: 260px;
  }

  .main-content {
    margin-left: 260px;
  }

  .app-content {
    padding: 24px;
  }

  .search-bar {
    width: 250px;
  }
}
```

- [ ] **Step 2: Add media query for tablet (768px)**

Append:

```css
@media (max-width: 768px) {
  .sidebar {
    width: 220px;
  }

  .main-content {
    margin-left: 220px;
  }

  .app-header {
    height: 56px;
    padding: 0 16px;
  }

  .app-content {
    padding: 16px;
  }

  .page-title {
    font-size: var(--font-size-md);
  }

  .header-actions {
    gap: 12px;
  }

  .search-bar {
    width: 150px;
    display: none;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .charts-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .dashboard-header {
    flex-direction: column;
    gap: 12px;
  }

  .filter-bar {
    flex-wrap: wrap;
  }

  .section-header {
    flex-direction: column;
    gap: 12px;
  }
}
```

- [ ] **Step 3: Add media query for mobile (480px)**

Append:

```css
@media (max-width: 480px) {
  .sidebar {
    width: 150px;
  }

  .sidebar-brand,
  .nav-link span,
  .btn-logout span {
    display: none;
  }

  .nav-link {
    justify-content: center;
    padding: 12px;
  }

  .main-content {
    margin-left: 150px;
  }

  .app-header {
    height: 52px;
    padding: 0 12px;
    gap: 8px;
  }

  .page-title {
    font-size: var(--font-size-base);
  }

  .header-actions {
    gap: 8px;
  }

  .search-bar {
    display: none;
  }

  .profile-section {
    gap: 8px;
  }

  .avatar {
    width: 32px;
    height: 32px;
    font-size: var(--font-size-sm);
  }

  .app-content {
    padding: 12px;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .kpi-card {
    padding: 16px;
  }

  .kpi-value {
    font-size: var(--font-size-2xl);
  }

  .charts-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .chart-card {
    min-height: 240px;
  }

  .chart-container {
    min-height: 200px;
    padding: 12px;
  }

  .modal-content {
    width: 95%;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Test responsiveness in browser**

Using browser DevTools, test at each breakpoint:

**Desktop (1920px):**
- Sidebar 260px, full brand + nav text
- KPI grid 4 columns
- Charts grid 2 columns
- Search bar 300px

**Laptop (1366px):**
- Sidebar 260px
- KPI grid 4 columns
- Charts grid 2 columns
- Search bar 250px

**Tablet (768px):**
- Sidebar 220px
- KPI grid 2 columns
- Charts grid 1 column
- Search bar hidden
- Header height 56px

**Mobile (480px):**
- Sidebar 150px with icons only (text hidden)
- KPI grid 1 column
- Charts grid 1 column
- Header height 52px
- All forms single column
- Modal full-width (95%)

- [ ] **Step 5: Visual validation**

Resize browser window and verify:
- No horizontal scrolling at any size
- Content reflows smoothly
- Text remains readable
- Buttons/inputs remain clickable
- Sidebar icons visible and clickable on mobile

- [ ] **Step 6: Commit**

```bash
git add admin/styles.css
git commit -m "feat: implement responsive design for 4 breakpoints (desktop, laptop, tablet, mobile)"
```

---

### Task 9: Data Integration — Verify Real Analytics Endpoints

**Files:**
- Verify: `src/routes/analytics.ts` (all endpoints functional)
- Verify: `admin/dashboard.js` (correctly calls endpoints)

**Interfaces:**
- Consumes: `/admin/analytics/users?days=N`, `/admin/analytics/messages?days=N`, `/admin/analytics/tokens?days=N`, `/admin/analytics/expenses?days=N`, `/admin/analytics/recent-messages?limit=5`
- Produces: Real data displayed in KPI cards, charts, messages list

**Details:**

- [ ] **Step 1: Verify all analytics endpoints exist**

Check `src/routes/analytics.ts` for these endpoints:

1. `GET /admin/analytics/users?days=N` → returns `{ data: [{ date, cumulative_count, new_count }] }`
2. `GET /admin/analytics/messages?days=N` → returns `{ data: [{ date, count }] }`
3. `GET /admin/analytics/tokens?days=N` → returns `{ total, data: [{ date, total }], byUser: [{ phone_number, tokens }] }`
4. `GET /admin/analytics/expenses?days=N` → returns `{ data: [{ date, total }] }`
5. `GET /admin/analytics/recent-messages?limit=5` → returns `{ messages: [{ phone_number, message_text, created_at }] }`

If any are missing, implement them in analytics.ts.

- [ ] **Step 2: Test endpoints with curl/Postman**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/admin/analytics/users?days=7
curl -H "Authorization: Bearer <token>" http://localhost:3001/admin/analytics/messages?days=7
curl -H "Authorization: Bearer <token>" http://localhost:3001/admin/analytics/tokens?days=7
curl -H "Authorization: Bearer <token>" http://localhost:3001/admin/analytics/expenses?days=7
curl -H "Authorization: Bearer <token>" http://localhost:3001/admin/analytics/recent-messages?limit=5
```

Expected: JSON responses with expected structure. If any errors, fix endpoint logic.

- [ ] **Step 3: Test dashboard data loading in browser**

1. Open dashboard (login with password)
2. Verify KPI cards show numeric values (not "—")
3. Verify 4 charts render with data
4. Verify Recent Messages shows database messages
5. Switch filters (7d → 30d → 90d) → values update
6. Check browser console for any fetch errors

- [ ] **Step 4: Test custom date filter**

1. Click "Personalizado" filter button
2. Date range picker appears
3. Select from/to dates
4. Click "Filtrar"
5. Charts and KPIs update with custom range data

- [ ] **Step 5: Test empty state**

1. Select a date range with no data (e.g., 2026-01-01 to 2026-01-05)
2. Verify all charts show "Sem dados para o período"
3. Verify KPI cards show "—" or 0
4. No console errors

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "feat: verify all analytics endpoints and data integration"
```

(Use `--allow-empty` if no changes needed; only commit if endpoint fixes were made.)

---

### Task 10: Final Validation and Testing

**Files:**
- Test: Manual visual verification across all tasks
- Test: All breakpoints and browsers

**Interfaces:**
- Consumes: Complete dashboard with all components integrated
- Produces: Verified, production-ready Memo dashboard matching Fasto design

**Details:**

- [ ] **Step 1: Login and authentication flow**

1. Open http://localhost:3001/admin
2. Verify login page shows
3. Enter password (from your .env)
4. Verify dashboard loads
5. Test logout → redirects to login
6. Test theme toggle persists on login/logout cycle

Expected: All auth flows work; no broken states.

- [ ] **Step 2: KPI cards comprehensive test**

1. Verify 4 KPI cards visible with colored top bars (blue, orange, green, purple)
2. Each shows label, value (formatted with commas), change indicator
3. Switch filters (7d, 30d, 90d, custom) → values update
4. Test with no data → cards show "—"
5. Verify hover effect (shadow lift)

Expected: KPIs match spec visually and functionally.

- [ ] **Step 3: Charts comprehensive test**

1. Verify 4 chart cards render (users evolution, messages, tokens, expenses)
2. All charts use smooth lines (tension 0.4) and proper colors
3. Grid lines are subtle
4. Legends hidden
5. Empty state shows "Sem dados para o período"
6. Hover on chart shows tooltip
7. Charts responsive on resize

Expected: All charts match Fasto style.

- [ ] **Step 4: Sidebar and navigation**

1. Verify sidebar is green (#2d5a3d)
2. Sidebar shows brand "Memo", 4 nav links (Dashboard, Usuários, Perfil, Settings)
3. Dashboard link has active indicator (left border, lighter background)
4. Hover on nav links changes background
5. Logout button at bottom with icon
6. On mobile (480px), sidebar shows icons only, text hidden

Expected: Navigation matches spec and is usable on all sizes.

- [ ] **Step 5: Header and search**

1. Verify header is sticky, shows page title "Painel de Controle"
2. Search bar visible and functional (can type)
3. Notifications badge shows (with red dot)
4. Avatar shows "A" (admin initial)
5. Theme toggle button (moon icon) works
6. On mobile, search bar hidden

Expected: Header is polished and functional.

- [ ] **Step 6: Secondary sections**

1. Verify To-Do list shows 3 mock items
2. Checkboxes work (strike through on check)
3. Recent Messages section loads and displays real messages from database
4. Each message shows phone, text preview, time ago
5. Empty state shows "Sem mensagens"

Expected: Secondary sections display correctly with real and mock data.

- [ ] **Step 7: Users management section**

1. Scroll down to "Gerenciamento de Usuários"
2. Verify add user form still works (phone + date inputs, button)
3. Verify users table renders with search filter
4. Verify edit modal opens on "Editar" click
5. Verify revoke button works on active users

Expected: All existing functionality preserved.

- [ ] **Step 8: Dark mode end-to-end**

1. Click theme toggle
2. Verify entire page switches to dark colors (no flicker)
3. All text, backgrounds, borders update
4. Reload page → dark mode persists
5. Switch back to light → verify all colors correct
6. Test on all sections (KPIs, charts, sidebar, header, modals)

Expected: Dark mode is smooth, complete, and persists.

- [ ] **Step 9: Responsive testing at all breakpoints**

Using DevTools, test at:
- 1920px (desktop): 4-col KPI, 2-col charts, full sidebar, search visible
- 1366px (laptop): same as desktop
- 768px (tablet): 2-col KPI, 1-col charts, search hidden, sidebar 220px
- 480px (mobile): 1-col KPI, 1-col charts, sidebar icons only

For each size:
- No horizontal scrolling
- Content reflows smoothly
- Touch targets (buttons) remain usable
- Text remains readable

Expected: Dashboard is fully responsive.

- [ ] **Step 10: Performance and error handling**

1. Open dashboard, monitor Network tab in DevTools
2. Verify all 5 analytics endpoints load in < 1s total
3. Switch filters multiple times → no duplicate requests, proper caching
4. Force offline mode → verify graceful error handling in console
5. Test with database offline → analytics show no data, no hard errors

Expected: Performance is good and errors are handled gracefully.

- [ ] **Step 11: Full suite regression test**

Run all existing tests (if any):

```bash
npm test
```

Expected: All tests pass, no new failures introduced.

- [ ] **Step 12: Final commit and cleanup**

Verify no uncommitted changes:

```bash
git status
```

Should be clean. If anything remains:

```bash
git add .
git commit -m "test: final validation and visual verification of dashboard redesign"
```

- [ ] **Step 13: Create tag for release**

```bash
git tag -a v1.0-dashboard -m "Memo Dashboard Redesign — Fasto-inspired with professional SaaS styling"
git log --oneline | head -15  # verify all 10 tasks are committed
```

Expected: All 10 task commits visible in log.

---

## Summary

This plan breaks the Fasto-inspired dashboard redesign into 10 atomic, independently testable tasks:

1. **CSS Design System** — layout foundation (containers, cards, grids)
2. **HTML Restructuring** — header, sidebar, content layout
3. **Sidebar Styling** — navigation with active states and hover effects
4. **KPI Cards** — real data display with formatting
5. **Chart Styling** — Chart.js verification and empty states
6. **Secondary Sections** — to-do (mock), messages (real database)
7. **Dark Mode** — toggle and persistence verification
8. **Responsive Design** — 4 breakpoints (1920, 1366, 768, 480)
9. **Data Integration** — all analytics endpoints tested
10. **Final Validation** — comprehensive end-to-end testing

**No new dependencies**; all work within existing vanilla HTML/CSS/JS + Chart.js CDN. **Existing functionality** (login, users table, modals) remains intact. **Progressive enhancement** ensures each task adds visible value.

All tasks use **TDD**: visual expectations (from spec) are verified in browser before marking complete. **Git commits** after each task ensure atomicity and traceability.

**Estimated effort:** 8-12 hours for full implementation and testing.

