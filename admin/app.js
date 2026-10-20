let token = localStorage.getItem('memo_token');
let allUsers = [];
let editingPhone = null;

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

    if (!res.ok) return alert('Senha inválida');

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

function logout() {
  localStorage.removeItem('memo_token');
  token = null;
  allUsers = [];
  showLogin();
  location.reload();
}

// ============================================================================
// UI
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
// DATA
// ============================================================================

async function loadDashboard() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed');

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

    if (!res.ok) throw new Error('Failed');

    const data = await res.json();
    allUsers = data.users;
    renderWhitelist(allUsers);
  } catch (err) {
    alert('Erro ao carregar usuários');
  }
}

function renderWhitelist(users) {
  const tbody = document.getElementById('whitelist-body');
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">Nenhum usuário cadastrado</td></tr>';
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
          ${user.status === 'active' ? `<button class="btn-action" onclick="revokeUser('${user.phone_number}')">Revogar</button>` : ''}
          <button class="btn-action" onclick="openEditModal('${user.phone_number}')">Editar</button>
        </div>
      </td>
    `;
  });
}

// ============================================================================
// MODAL
// ============================================================================

function openEditModal(phone) {
  const user = allUsers.find(u => u.phone_number === phone);
  if (!user) return;

  editingPhone = phone;
  const dateStr = user.permitted_until.split('T')[0];
  document.getElementById('edit-date-input').value = dateStr;

  const [year, month, day] = dateStr.split('-');
  document.getElementById('edit-current-date').textContent = `Data atual: ${day}/${month}/${year}`;

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editingPhone = null;
}

async function confirmEdit() {
  const newDate = document.getElementById('edit-date-input').value;
  if (!newDate || !editingPhone) return;

  try {
    const res = await fetch(`/admin/whitelist/${editingPhone}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ permitted_until: newDate })
    });

    if (!res.ok) throw new Error('Erro');

    closeEditModal();
    loadDashboard();
  } catch (err) {
    alert('Erro ao atualizar usuário');
  }
}

// ============================================================================
// ACTIONS
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
      body: JSON.stringify({ phone, permitted_until: correctedDate })
    });

    if (!res.ok) throw new Error('Erro');

    document.getElementById('new-phone').value = '';
    document.getElementById('new-expiry').value = '';
    loadDashboard();
    alert('Usuário adicionado!');
  } catch (err) {
    alert('Erro ao adicionar usuário');
  }
}

async function revokeUser(phone) {
  if (!confirm('Revogar acesso deste usuário?')) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Erro');

    loadDashboard();
    alert('Acesso revogado!');
  } catch (err) {
    alert('Erro ao revogar usuário');
  }
}

function filterTable() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();

  if (!searchTerm) {
    renderWhitelist(allUsers);
    return;
  }

  const filtered = allUsers.filter(u =>
    u.phone_number.toLowerCase().includes(searchTerm)
  );

  renderWhitelist(filtered);
}
