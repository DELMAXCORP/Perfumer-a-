(() => {
  'use strict';
  const ADMIN_PASSWORD = 'alpha2026';
  const loginView = document.getElementById('login-view');
  const adminView = document.getElementById('admin-view');
  const loginBtn = document.getElementById('admin-login-btn');
  const passInput = document.getElementById('admin-pass');
  const loginError = document.getElementById('admin-login-error');
  const refreshBtn = document.getElementById('admin-refresh');
  const logoutBtn = document.getElementById('admin-logout');
  const tableWrap = document.getElementById('admin-table-wrap');
  const stats = document.getElementById('admin-stats');

  function getClient() { return window.supabaseClient; }

  loginBtn.addEventListener('click', () => {
    if (passInput.value === ADMIN_PASSWORD) {
      sessionStorage.setItem('alpha-admin', '1');
      showAdmin();
    } else {
      loginError.textContent = 'Clave incorrecta.';
    }
  });
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
  if (sessionStorage.getItem('alpha-admin') === '1') showAdmin();

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('alpha-admin');
    location.reload();
  });

  async function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    await loadContacts();
  }

  async function loadContacts() {
    const client = getClient();
    if (!client) { tableWrap.innerHTML = '<p class="admin-error">Cliente de Supabase no disponible.</p>'; return; }
    const { data, error } = await client.from('contactos').select('*').order('created_at', { ascending: false });
    if (error) { tableWrap.innerHTML = '<p class="admin-error">' + escape(error.message) + '</p>'; return; }
    render(data || []);
  }

  function render(rows) {
    const pending = rows.filter(r => r.estado === 'pendiente').length;
    const ok = rows.filter(r => r.estado === 'exitosa').length;
    const discarded = rows.filter(r => r.estado === 'descartada').length;
    stats.textContent = `Total: ${rows.length} · Pendientes: ${pending} · Exitosas: ${ok} · Descartadas: ${discarded}`;
    if (!rows.length) { tableWrap.innerHTML = '<p class="admin-summary">Sin contactos registrados.</p>'; return; }
    const html = ['<table class="admin-table"><thead><tr><th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Entrega</th><th>Estado</th><th>Pedido</th><th>Acciones</th></tr></thead><tbody>'];
    rows.forEach((r) => {
      const date = new Date(r.created_at).toLocaleString('es-PE');
      html.push(`<tr>
        <td>${escape(date)}</td>
        <td>${escape(r.nombre)}</td>
        <td>${escape(r.telefono)}</td>
        <td>${escape(r.forma_entrega || '-')}</td>
        <td><span class="status-pill status-${escape(r.estado)}">${escape(r.estado)}</span></td>
        <td class="admin-row-pedido">${escape(r.pedido_resumen || '')}</td>
        <td class="admin-actions">
          ${r.estado !== 'exitosa' ? `<button data-id="${r.id}" data-action="exitosa" class="ok">Marcar exitosa</button>` : ''}
          ${r.estado !== 'descartada' ? `<button data-id="${r.id}" data-action="descartada" class="bad">Descartar</button>` : ''}
          <button data-id="${r.id}" data-action="delete" class="bad">Eliminar</button>
        </td>
      </tr>`);
    });
    html.push('</tbody></table>');
    tableWrap.innerHTML = html.join('');
    tableWrap.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.id, btn.dataset.action));
    });
  }

  async function handleAction(id, action) {
    const client = getClient();
    if (action === 'delete') {
      const { error } = await client.from('contactos').delete().eq('id', id);
      if (error) return alert(error.message);
    } else {
      const { error } = await client.from('contactos').update({ estado: action }).eq('id', id);
      if (error) return alert(error.message);
    }
    await loadContacts();
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  }

  refreshBtn.addEventListener('click', loadContacts);
})();