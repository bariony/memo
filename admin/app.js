let token = localStorage.getItem('memo_token');
let allUsers = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    showDashboard();
    loadDashboard();
  }
});

// ============================================================================
// AUTH
// ============================================================================

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
    console.error('Login error:', err);
    alert('Erro ao fazer login');
  }
}

function logout() {
  localStorage.removeItem('memo_token');
  token = null;
  allUsers = [];
  showLogin();
  location.reload();
}

// ============================================================================
// UI VISIBILITY
// ============================================================================

function showDashboard() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

async function loadDashboard() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load stats');

    const stats = await res.json();
    document.getElementById('active-users').textContent = stats.active_users;
    document.getElementById('total-expenses').textContent = stats.total_expenses;

    await loadWhitelist();
  } catch (err) {
    console.error('Dashboard load error:', err);
    alert('Erro ao carregar dados');
  }
}

async function loadWhitelist() {
  try {
    const res = await fetch('/admin/whitelist', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load whitelist');

    const data = await res.json();
    allUsers = data.users;
    renderWhitelist(allUsers);
  } catch (err) {
    console.error('Whitelist load error:', err);
    alert('Erro ao carregar usuários');
  }
}

function renderWhitelist(users) {
  const tbody = document.getElementById('whitelist-body');
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--text-secondary);">Nenhum usuário cadastrado</td></tr>';
    return;
  }

  users.forEach((user) => {
    const dateStr = user.permitted_until.split('T')[0];
    const [year, month, day] = dateStr.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    const statusClass = user.status === 'active' ? 'active' : 'revoked';
    const statusText = user.status === 'active' ? 'Ativo' : 'Revogado';

    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${user.phone_number}</td>
      <td>${formattedDate}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>
        <div class="table-actions">
          ${user.status === 'active' ? `
            <button class="btn-action" onclick="revokeUser('${user.phone_number}')">Revogar</button>
          ` : ''}
          <button class="btn-action" onclick="editUser('${user.phone_number}')">Editar</button>
        </div>
      </td>
    `;
  });
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function addUser() {
  const phone = document.getElementById('new-phone').value;
  const expiry = document.getElementById('new-expiry').value;

  if (!phone || !expiry) return alert('Preencha todos os campos');

  try {
    const d = new Date(expiry + 'T00:00:00');
    const correctedDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const res = await fetch('/admin/whitelist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phone,
        permitted_until: correctedDate
      })
    });

    if (!res.ok) throw new Error('Erro ao adicionar');

    document.getElementById('new-phone').value = '';
    document.getElementById('new-expiry').value = '';
    loadDashboard();
    alert('Usuário adicionado com sucesso!');
  } catch (err) {
    console.error('Add user error:', err);
    alert('Erro ao adicionar usuário');
  }
}

async function revokeUser(phone) {
  if (!confirm('Tem certeza que quer revogar o acesso deste usuário?')) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Erro ao revogar');

    loadDashboard();
    alert('Acesso revogado com sucesso!');
  } catch (err) {
    console.error('Revoke error:', err);
    alert('Erro ao revogar usuário');
  }
}

async function editUser(phone) {
  const currentUser = allUsers.find(u => u.phone_number === phone);
  if (!currentUser) return;

  const dateStr = currentUser.permitted_until.split('T')[0];
  const [year, month, day] = dateStr.split('-');
  const currentFormatted = `${day}/${month}/${year}`;

  const newDate = prompt(`Nova data de expiração (DD/MM/YYYY):\n\nData atual: ${currentFormatted}`);
  if (!newDate) return;

  try {
    const [day, month, year] = newDate.split('/');
    const formatted = `${year}-${month}-${day}`;

    const res = await fetch(`/admin/whitelist/${phone}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ permitted_until: formatted })
    });

    if (!res.ok) throw new Error('Erro ao atualizar');

    loadDashboard();
    alert('Data atualizada com sucesso!');
  } catch (err) {
    console.error('Edit error:', err);
    alert('Erro ao atualizar usuário');
  }
}

// ============================================================================
// SEARCH & FILTER
// ============================================================================

function filterTable() {
  const searchInput = document.getElementById('search-input');
  const searchTerm = searchInput.value.toLowerCase().trim();

  if (searchTerm === '') {
    renderWhitelist(allUsers);
    return;
  }

  const filtered = allUsers.filter(user =>
    user.phone_number.toLowerCase().includes(searchTerm)
  );

  renderWhitelist(filtered);
}
