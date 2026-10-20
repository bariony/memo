let token = localStorage.getItem('memo_token');
let allUsers = [];
let editingPhone = null;

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

function initTheme() {
  const savedTheme = localStorage.getItem('memo-theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('memo-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('memo-theme', 'light');
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  if (token) {
    showDashboard();
    loadDashboard();
  }
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function login() {
  const password = document.getElementById('password').value;
  if (!password) {
    alert('Digite a senha');
    return;
  }

  try {
    const res = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      alert('Senha inválida');
      return;
    }

    const data = await res.json();
    token = data.token;
    localStorage.setItem('memo_token', token);
    document.getElementById('password').value = '';
    showDashboard();
    loadDashboard();
  } catch (err) {
    alert('Erro ao fazer login');
    console.error(err);
  }
}

function logout() {
  if (confirm('Tem certeza que deseja sair?')) {
    localStorage.removeItem('memo_token');
    token = null;
    allUsers = [];
    showLogin();
    location.reload();
  }
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
// DATA LOADING
// ============================================================================

async function loadDashboard() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load stats');

    await loadWhitelist();
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

async function loadWhitelist() {
  try {
    const res = await fetch('/admin/whitelist', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load whitelist');

    const data = await res.json();
    allUsers = data.users || [];
    renderWhitelist(allUsers);
  } catch (err) {
    console.error('Whitelist load error:', err);
  }
}

function renderWhitelist(users) {
  const tbody = document.getElementById('whitelist-body');
  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--color-text-tertiary); padding: 40px;">
          Nenhum usuário cadastrado
        </td>
      </tr>
    `;
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
// MODAL MANAGEMENT
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

    if (!res.ok) throw new Error('Update failed');

    closeEditModal();
    loadDashboard();
    alert('Data atualizada com sucesso');
  } catch (err) {
    alert('Erro ao atualizar data');
    console.error(err);
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function addUser() {
  const phone = document.getElementById('new-phone').value;
  const expiry = document.getElementById('new-expiry').value;

  if (!phone || !expiry) {
    alert('Preencha todos os campos');
    return;
  }

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

    if (!res.ok) throw new Error('Add user failed');

    document.getElementById('new-phone').value = '';
    document.getElementById('new-expiry').value = '';
    loadDashboard();
    alert('Usuário adicionado com sucesso');
  } catch (err) {
    alert('Erro ao adicionar usuário');
    console.error(err);
  }
}

async function revokeUser(phone) {
  if (!confirm('Revogar acesso deste usuário?')) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Revoke failed');

    loadDashboard();
    alert('Acesso revogado com sucesso');
  } catch (err) {
    alert('Erro ao revogar acesso');
    console.error(err);
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
