let currentDays = 7;
let charts = {};

async function loadAnalytics(days) {
  currentDays = days;
  const token = localStorage.getItem('memo_token');

  try {
    const [users, messages, tokens, expenses] = await Promise.all([
      fetch(`/admin/analytics/users?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()),
      fetch(`/admin/analytics/messages?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()),
      fetch(`/admin/analytics/tokens?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()),
      fetch(`/admin/analytics/expenses?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json())
    ]);

    renderCharts(users.data, messages.data, tokens, expenses.data);
    renderRankings(tokens.byUser);
    updateKPIs(users.data, messages.data, tokens);
  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

function renderCharts(users, messages, tokens, expenses) {
  // Users chart
  if (charts.users) charts.users.destroy();
  charts.users = new Chart(document.getElementById('users-chart'), {
    type: 'line',
    data: {
      labels: users.map(u => u.date),
      datasets: [{
        label: 'Usuários Cumulativos',
        data: users.map(u => u.cumulative_count),
        borderColor: '#0066ff',
        backgroundColor: 'rgba(0, 102, 255, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Messages chart
  if (charts.messages) charts.messages.destroy();
  charts.messages = new Chart(document.getElementById('messages-chart'), {
    type: 'bar',
    data: {
      labels: messages.map(m => m.date),
      datasets: [{
        label: 'Mensagens',
        data: messages.map(m => m.count),
        backgroundColor: '#10b981'
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Tokens chart
  if (charts.tokens) charts.tokens.destroy();
  charts.tokens = new Chart(document.getElementById('tokens-chart'), {
    type: 'line',
    data: {
      labels: tokens.data ? tokens.data.map(t => t.date) : [],
      datasets: [{
        label: 'Tokens',
        data: tokens.data ? tokens.data.map(t => t.total) : [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Expenses chart
  if (charts.expenses) charts.expenses.destroy();
  charts.expenses = new Chart(document.getElementById('expenses-chart'), {
    type: 'line',
    data: {
      labels: expenses.map(e => e.date),
      datasets: [{
        label: 'Gastos',
        data: expenses.map(e => e.total),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function updateKPIs(users, messages, tokens) {
  const totalUsers = users.length > 0 ? users[users.length - 1].cumulative_count : 0;
  const newUsers = users.reduce((sum, u) => sum + u.new_count, 0);
  const totalMessages = messages.reduce((sum, m) => sum + m.count, 0);

  document.getElementById('total-users').textContent = totalUsers;
  document.getElementById('new-users').textContent = newUsers;
  document.getElementById('total-messages').textContent = totalMessages;
  document.getElementById('total-tokens').textContent = tokens.total;
}

function renderRankings(byUser) {
  const tbody = document.getElementById('tokens-ranking');
  tbody.innerHTML = '';

  byUser.forEach(u => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${u.phone_number}</td>
      <td>${u.tokens}</td>
    `;
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadAnalytics(7);

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const days = e.target.dataset.days;
      loadAnalytics(parseInt(days));
    });
  });
});
