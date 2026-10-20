let token = localStorage.getItem('memo_token');
let allUsers = [];
let editingPhone = null;
let toastTimer = null;

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
    // Load whitelist immediately on page load
    loadWhitelist();
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
  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');
  if (loginSection) loginSection.classList.add('hidden');
  if (dashboardSection) dashboardSection.classList.remove('hidden');
}

function showLogin() {
  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');
  if (loginSection) loginSection.classList.remove('hidden');
  if (dashboardSection) dashboardSection.classList.add('hidden');
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadDashboard() {
  // Load stats in background (don't block whitelist)
  fetch('/admin/stats', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).catch(err => console.error('Stats load error:', err));

  // Load whitelist immediately without waiting for stats
  await loadWhitelist();
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
          ${user.status === 'active' ? `<button class="btn-action revoke" onclick="revokeUser('${user.phone_number}')">Revogar</button>` : ''}
          <button class="btn-action edit" onclick="openEditModal('${user.phone_number}')">Editar</button>
        </div>
      </td>
    `;
  });
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function openAddModal() {
  document.getElementById('add-modal').classList.add('open');
  document.getElementById('add-phone').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
  document.getElementById('add-phone').value = '';
  document.getElementById('add-expiry').value = '';
}

function openEditModal(phone) {
  const user = allUsers.find(u => u.phone_number === phone);
  if (!user) return;

  editingPhone = phone;
  const dateStr = user.permitted_until.split('T')[0];
  document.getElementById('edit-date-input').value = dateStr;
  document.getElementById('edit-phone').value = phone;

  const [year, month, day] = dateStr.split('-');
  document.getElementById('edit-current-date').textContent = `Data atual: ${day}/${month}/${year}`;

  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
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
  const phone = document.getElementById('add-phone').value;
  const expiry = document.getElementById('add-expiry').value;

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

    document.getElementById('add-phone').value = '';
    document.getElementById('add-expiry').value = '';
    closeAddModal();
    loadDashboard();
    showToast('✅ Usuário adicionado com sucesso!');
  } catch (err) {
    showToast('❌ Erro ao adicionar usuário', 'error');
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
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase();

  if (!searchTerm) {
    renderWhitelist(allUsers);
    return;
  }

  const filtered = allUsers.filter(u =>
    u.phone_number.toLowerCase().includes(searchTerm)
  );

  renderWhitelist(filtered);
}

// ============================================================================
// UI NAVIGATION
// ============================================================================

function scrollToUsers() {
  const tableCard = document.querySelector('.table-card');
  if (tableCard) {
    tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================================================
// TOAST & UI HELPERS
// ============================================================================

function showToast(msg, icon = '✅') {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMsg = document.getElementById('toast-msg');

  if (toastIcon) toastIcon.textContent = icon;
  if (toastMsg) toastMsg.textContent = msg;

  toast?.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast?.classList.remove('show');
  }, 3000);
}

function setPeriod(btn, days) {
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadAnalytics(days);
}

function refreshData() {
  loadDashboard();
  showToast('🔄 Dados atualizados!');
}


function filterStatus(el, status) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  // Filter table rows based on status
  document.querySelectorAll('#whitelist-body tr').forEach(row => {
    const badge = row.querySelector('.badge');
    if (!badge) return;

    const isActive = badge.classList.contains('active');
    const matches = status === 'all' || (status === 'active' && isActive) || (status === 'inactive' && !isActive);
    row.style.display = matches ? '' : 'none';
  });

  updateCount();
}

function updateCount() {
  const visible = [...document.querySelectorAll('#whitelist-body tr')].filter(r => r.style.display !== 'none').length;
  const countEl = document.getElementById('table-count');
  if (countEl) {
    countEl.textContent = `${visible} usuário${visible !== 1 ? 's' : ''}`;
  }
}

// ============================================================================
// PHONE FORMATTING & DURATION
// ============================================================================

function formatPhoneInput(input) {
  let value = input.value.replace(/\D/g, '');

  if (value.length > 11) {
    value = value.substring(0, 11);
  }

  let formatted = '';
  if (value.length > 0) formatted += value.substring(0, 2);
  if (value.length > 2) formatted += ' ' + value.substring(2, 7);
  if (value.length > 7) formatted += '-' + value.substring(7, 11);

  input.value = formatted;

  const errorEl = document.getElementById('phone-error');
  if (value.length === 11 && !isValidPhone(value)) {
    if (errorEl) errorEl.style.display = 'block';
  } else {
    if (errorEl) errorEl.style.display = 'none';
  }
}

function isValidPhone(value) {
  const phone = value.replace(/\D/g, '');
  if (phone.length !== 11) return false;

  // DDD deve ser 11-99
  const ddd = parseInt(phone.substring(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  // Terceiro dígito deve ser 9 para celular
  const firstDigitAfterDDD = phone[2];
  if (firstDigitAfterDDD !== '9') return false;

  return true;
}

function setDuration(days) {
  const today = new Date();
  const expiryDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  const year = expiryDate.getFullYear();
  const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
  const day = String(expiryDate.getDate()).padStart(2, '0');

  document.getElementById('add-expiry').value = `${year}-${month}-${day}`;

  document.querySelectorAll('.btn-duration').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}
