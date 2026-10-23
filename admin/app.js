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

// Global 401 handler: an expired/invalid token must send the user back to login
// instead of silently rendering empty lists and zeroed counters.
const _origFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await _origFetch(input, init);
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (res.status === 401 && url.startsWith('/admin') && !url.startsWith('/admin/auth')) {
    localStorage.removeItem('memo_token');
    token = null;
    showLogin();
    showToast('Sessão expirada, entre novamente', '⚠️');
  }
  return res;
};

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
    loadWhitelist();
    loadAccessRequests();
  } else {
    showLogin();
  }
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function login() {
  const password = document.getElementById('password').value;
  if (!password) {
    showToast('Digite a senha', '⚠️');
    return;
  }

  try {
    const res = await fetch('/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      showToast('Senha inválida', '❌');
      return;
    }

    const data = await res.json();
    token = data.token;
    localStorage.setItem('memo_token', token);
    document.getElementById('password').value = '';
    showDashboard();
    loadDashboard();
  } catch (err) {
    showToast('Erro ao fazer login', '❌');
    console.error(err);
  }
}

async function logout() {
  const ok = await confirmModal('Tem certeza que deseja sair?', 'Sair');
  if (ok) {
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
  await loadAccessRequests();
}

// ============================================================================
// ACCESS REQUESTS
// ============================================================================

async function loadAccessRequests() {
  try {
    const res = await fetch('/admin/access-requests', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load access requests');

    const data = await res.json();
    renderAccessRequests(data.requests || []);
  } catch (err) {
    console.error('Access requests load error:', err);
  }
}

function renderAccessRequests(requests) {
  const tbody = document.getElementById('access-requests-body');
  const countEl = document.getElementById('access-requests-count');
  if (countEl) countEl.textContent = requests.length;

  if (!tbody) return;

  if (!requests || requests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--color-text-tertiary); padding: 40px;">
          Nenhuma solicitação pendente
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  requests.forEach((r) => {
    const when = new Date(r.created_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${r.name || '(sem nome)'}</td>
      <td>${r.phone_number}</td>
      <td>${when}</td>
      <td>
        <div class="table-actions">
          <button class="btn-action" onclick="approveAccessRequest('${r.id}')">Aprovar (14d)</button>
          <button class="btn-action revoke" onclick="denyAccessRequest('${r.id}')">Negar</button>
        </div>
      </td>
    `;
  });
}

async function approveAccessRequest(id) {
  const ok = await confirmModal('Liberar 14 dias de teste para essa pessoa?', 'Aprovar acesso');
  if (!ok) return;

  try {
    const res = await fetch(`/admin/access-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ days: 14 })
    });

    if (!res.ok) throw new Error('Approve failed');

    loadDashboard();
    showToast('Acesso aprovado e usuário avisado no WhatsApp!');
  } catch (err) {
    showToast('Erro ao aprovar acesso', '❌');
    console.error(err);
  }
}

async function denyAccessRequest(id) {
  const ok = await confirmModal('Negar essa solicitação de acesso?', 'Negar acesso');
  if (!ok) return;

  try {
    const res = await fetch(`/admin/access-requests/${encodeURIComponent(id)}/deny`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Deny failed');

    loadDashboard();
    showToast('Solicitação negada');
  } catch (err) {
    showToast('Erro ao negar solicitação', '❌');
    console.error(err);
  }
}

function scrollToAccessRequests() {
  const card = document.getElementById('access-requests-card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    updateCount();
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
          <button class="btn-action revoke" onclick="deleteUser('${user.phone_number}')">Excluir</button>
        </div>
      </td>
    `;
  });

  updateCount();
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
    const res = await fetch(`/admin/whitelist/${encodeURIComponent(editingPhone)}`, {
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
    showToast('Data atualizada com sucesso');
  } catch (err) {
    showToast('Erro ao atualizar data', '❌');
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
    showToast('Preencha todos os campos', '⚠️');
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

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Add user failed');
    }

    document.getElementById('add-phone').value = '';
    document.getElementById('add-expiry').value = '';
    closeAddModal();
    loadDashboard();
    showToast('Usuário adicionado com sucesso!');
  } catch (err) {
    showToast(err.message || 'Erro ao adicionar usuário', '❌');
    console.error(err);
  }
}

async function revokeUser(phone) {
  const ok = await confirmModal(`Revogar acesso de ${phone}?`, 'Revogar acesso');
  if (!ok) return;

  try {
    const res = await fetch(`/admin/whitelist/${encodeURIComponent(phone)}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Revoke failed');

    loadDashboard();
    showToast('Acesso revogado com sucesso');
  } catch (err) {
    showToast('Erro ao revogar acesso', '❌');
    console.error(err);
  }
}

async function deleteUser(phone) {
  const ok = await confirmModal(
    `Excluir ${phone} permanentemente? Essa ação não pode ser desfeita.`,
    'Excluir usuário'
  );
  if (!ok) return;

  try {
    const res = await fetch(`/admin/whitelist/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Delete failed');

    loadDashboard();
    showToast('Usuário excluído com sucesso');
  } catch (err) {
    showToast('Erro ao excluir usuário', '❌');
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

// ============================================================================
// THEMED CONFIRM MODAL (replaces native confirm()/alert())
// ============================================================================

function confirmModal(message, title = 'Confirmar ação') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.add('open');

    const cleanup = (result) => {
      modal.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

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

  // If the user typed/pasted the country code (55) and that pushed the
  // total over 11 digits, strip it - this field only takes the local
  // DDD+number; 55 is added automatically when saving.
  if (value.length > 11 && value.startsWith('55')) {
    value = value.substring(2);
  }

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
