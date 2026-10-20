let currentDays = 7;
let charts = {};

// Initialize on dashboard load
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('memo_token');
  if (token) {
    // Period buttons (.period-tab) are already wired via onclick="setPeriod()" in index.html
    loadAnalytics(7);
  }
});

// ============================================================================
// FILTERS
// ============================================================================

function setupFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.id === 'btn-custom') {
        toggleCustomDateFilter();
      } else {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('custom-date-section').style.display = 'none';
        loadAnalytics(parseInt(e.target.dataset.days));
      }
    });
  });

  document.getElementById('btn-apply-filter').addEventListener('click', applyCustomFilter);
}

function toggleCustomDateFilter() {
  const section = document.getElementById('custom-date-section');
  const isVisible = section.style.display !== 'none';
  section.style.display = isVisible ? 'none' : 'block';
}

function applyCustomFilter() {
  const fromDate = document.getElementById('from-date').value;
  const toDate = document.getElementById('to-date').value;

  if (!fromDate || !toDate) {
    alert('Selecione ambas as datas');
    return;
  }

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  loadAnalyticsCustom(fromDate, toDate);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAnalytics(days) {
  currentDays = days;
  const token = localStorage.getItem('memo_token');

  try {
    const [usersData, messagesData, tokensData, expensesData] = await Promise.all([
      fetch(`/admin/users?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => generateMockUsers(days)),

      fetch(`/admin/messages?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ data: [] })),

      fetch(`/admin/tokens?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ total: 0, byUser: [] })),

      fetch(`/admin/expenses?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    renderCharts(usersData.data || [], messagesData.data || [], tokensData, expensesData.data || []);
    updateKPIs(usersData.data || [], messagesData.data || [], tokensData);
  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

function generateMockUsers(days) {
  const data = [];
  const today = new Date();
  let cumulative = 1;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    data.push({
      date: dateStr,
      new_count: i === days - 1 ? 1 : Math.random() > 0.8 ? 1 : 0,
      cumulative_count: cumulative
    });

    cumulative += (data[data.length - 1].new_count || 0);
  }

  return { data };
}

async function loadAnalyticsCustom(fromDate, toDate) {
  const token = localStorage.getItem('memo_token');

  try {
    // Calculate days difference for API
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const days = Math.ceil((to - from) / (1000 * 60 * 60 * 24));

    const [usersData, messagesData, tokensData, expensesData] = await Promise.all([
      fetch(`/admin/users?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ data: [] })),

      fetch(`/admin/messages?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ data: [] })),

      fetch(`/admin/tokens?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ total: 0, byUser: [] })),

      fetch(`/admin/expenses?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    renderCharts(usersData.data || [], messagesData.data || [], tokensData, expensesData.data || []);
    updateKPIs(usersData.data || [], messagesData.data || [], tokensData);
  } catch (err) {
    console.error('Custom analytics error:', err);
  }
}

// ============================================================================
// CHART RENDERING
// ============================================================================

function renderCharts(users, messages, tokens, expenses) {
  renderUserChart(users);
  renderMessagesChart(messages);
  renderTokensChart(tokens.data || []);
  renderExpensesChart(expenses);
}

function renderUserChart(data) {
  const ctx = document.getElementById('users-chart');
  if (!ctx) return;

  if (charts.users) charts.users.destroy();

  if (!data || data.length === 0) {
    showEmptyChart(ctx, 'users');
    return;
  }

  ctx.style.display = 'block';
  const emptyEl = document.getElementById('users-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  charts.users = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{
        label: 'Usuários Cumulativos',
        data: data.map(d => d.cumulative_count),
        borderColor: 'rgb(45, 90, 61)',
        backgroundColor: 'rgba(45, 90, 61, 0.05)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: 'rgb(45, 90, 61)',
        pointBorderColor: 'white',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderMessagesChart(data) {
  const ctx = document.getElementById('messages-chart');
  if (!ctx) return;

  if (charts.messages) charts.messages.destroy();

  if (!data || data.length === 0) {
    showEmptyChart(ctx, 'messages');
    return;
  }

  ctx.style.display = 'block';
  const emptyEl = document.getElementById('messages-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  charts.messages = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{
        label: 'Mensagens',
        data: data.map(d => d.count),
        backgroundColor: 'rgb(16, 185, 129)',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderTokensChart(data) {
  const ctx = document.getElementById('tokens-chart');
  if (!ctx) return;

  if (charts.tokens) charts.tokens.destroy();

  if (!data || data.length === 0) {
    showEmptyChart(ctx, 'tokens');
    return;
  }

  ctx.style.display = 'block';
  const emptyEl = document.getElementById('tokens-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  charts.tokens = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{
        label: 'Tokens',
        data: data.map(d => d.total || 0),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.05)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: 'rgb(245, 158, 11)',
        pointBorderColor: 'white',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderExpensesChart(data) {
  const ctx = document.getElementById('expenses-chart');
  if (!ctx) return;

  if (charts.expenses) charts.expenses.destroy();

  if (!data || data.length === 0) {
    showEmptyChart(ctx, 'expenses');
    return;
  }

  ctx.style.display = 'block';
  const emptyEl = document.getElementById('expenses-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  charts.expenses = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{
        label: 'Gastos',
        data: data.map(d => d.total || 0),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: 'rgb(239, 68, 68)',
        pointBorderColor: 'white',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function showEmptyChart(canvas, name) {
  canvas.style.display = 'none';
  const container = canvas.parentElement;
  let emptyEl = document.getElementById(name + '-empty');
  if (emptyEl) {
    emptyEl.style.display = 'flex';
  }
}

// ============================================================================
// KPI UPDATES
// ============================================================================

function updateKPIs(users, messages, tokens) {
  const totalUsers = users.length > 0 ? users[users.length - 1].cumulative_count : 0;
  const newUsers = users.reduce((sum, u) => sum + (u.new_count || 0), 0);
  const totalMessages = messages.reduce((sum, m) => sum + (m.count || 0), 0);

  const elTotal = document.getElementById('stat-total');
  const elNew = document.getElementById('stat-new');
  const elMsgs = document.getElementById('stat-msgs');
  const elTokens = document.getElementById('stat-tokens');

  if (elTotal) elTotal.textContent = formatNumber(totalUsers);
  if (elNew) elNew.textContent = formatNumber(newUsers);
  if (elMsgs) elMsgs.textContent = formatNumber(totalMessages);
  if (elTokens) elTokens.textContent = formatNumber(tokens.total || 0);
}

// ============================================================================
// RANKINGS
// ============================================================================
// UTILITIES
// ============================================================================

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatNumber(num) {
  return new Intl.NumberFormat('pt-BR').format(num);
}
