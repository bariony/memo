let token = localStorage.getItem('memo_token');

if (token) {
  showDashboard();
  loadDashboard();
}

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
    alert('Erro ao fazer login');
  }
}

async function loadDashboard() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

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

    const data = await res.json();
    const tbody = document.getElementById('whitelist-body');
    tbody.innerHTML = '';

    data.users.forEach((user) => {
      const row = tbody.insertRow();
      const dateStr = user.permitted_until.split('T')[0]; // pega só YYYY-MM-DD
      const [year, month, day] = dateStr.split('-');
      const date = `${day}/${month}/${year}`;
      const statusClass = user.status === 'active' ? 'status-active' : 'status-revoked';

      row.innerHTML = `
        <td>${user.phone_number}</td>
        <td>${date}</td>
        <td><span class="${statusClass}">${user.status}</span></td>
        <td>
          <div class="action-buttons">
            ${user.status === 'active' ? `
              <button onclick="revokeUser('${user.phone_number}')">Revogar</button>
            ` : ''}
            <button onclick="editUser('${user.phone_number}')">Editar</button>
          </div>
        </td>
      `;
    });
  } catch (err) {
    console.error('Erro ao carregar whitelist:', err);
  }
}

async function addUser() {
  const phone = document.getElementById('new-phone').value;
  const expiry = document.getElementById('new-expiry').value;

  if (!phone || !expiry) return alert('Preencha todos os campos');

  try {
    // Corrige timezone: pega a data do input e ajusta
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
    alert('Erro ao adicionar usuário');
  }
}

async function revokeUser(phone) {
  if (!confirm('Tem certeza que quer revogar?')) return;

  try {
    const res = await fetch(`/admin/whitelist/${phone}/revoke`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Erro');
    loadDashboard();
  } catch (err) {
    alert('Erro ao revogar usuário');
  }
}

async function editUser(phone) {
  const newDate = prompt('Nova data de expiração (DD/MM/YYYY):');
  if (!newDate) return;

  try {
    // Converte DD/MM/YYYY para YYYY-MM-DD
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

    if (!res.ok) throw new Error('Erro');
    loadDashboard();
    alert('Data atualizada!');
  } catch (err) {
    alert('Erro ao atualizar');
  }
}

function logout() {
  localStorage.removeItem('memo_token');
  token = null;
  showLogin();
  location.reload();
}

function showDashboard() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
}
