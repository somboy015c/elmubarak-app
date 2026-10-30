(function () {
  if (!Api.isLoggedIn()) {
    location.replace('login.html');
    return;
  }
  let user = Api.currentUser();
  if (!user?.isAdmin) {
    toast('This page is for admins only.', 'error');
    setTimeout(() => location.replace('dashboard.html'), 1200);
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const qs = (obj) => Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const TYPE_LABELS = {
    airtime: 'Airtime', data: 'Data', electricity: 'Electricity', cable: 'Cable TV', exam: 'Exam PIN',
    'wallet-funding': 'Wallet funding', 'transfer-out': 'Transfer sent', 'transfer-in': 'Transfer received',
    withdrawal: 'Withdrawal', airtime2cash: 'Airtime to cash', 'admin-adjustment': 'Admin adjustment'
  };
  const SERVICE_TYPES = ['airtime', 'data', 'electricity', 'cable', 'exam'];
  const NETWORK_NAMES = { mtn: 'MTN', glo: 'GLO', airtel: 'AIRTEL', '9mobile': '9MOBILE' };
  const titleCase = (t) => String(t).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const badge = (s) => `<span class="badge ${s === 'success' ? 'badge-success' : s === 'failed' ? 'badge-danger' : 'badge-neutral'}">${esc(s)}</span>`;

  // ---------- header ----------
  function renderUser() {
    const initial = (user.fullName || 'U').trim().charAt(0).toUpperCase();
    $('sidebar-avatar').textContent = initial;
    $('sidebar-username').textContent = user.fullName || 'there';
    $('sidebar-balance').textContent = formatNaira(user.walletBalance);
    $('topbar-avatar').textContent = initial;
    $('topbar-username').textContent = user.fullName || 'there';
    $('topbar-balance').textContent = formatNaira(user.walletBalance);
  }
  async function refreshUser() {
    try {
      const data = await Api.get('/auth/me');
      user = data.user;
      renderUser();
    } catch (e) { /* handled by Api */ }
  }
  $('logout-btn').addEventListener('click', () => Api.logout());

  // ---------- modal ----------
  const modalRoot = $('modal-root');
  const modalBox = $('modal-box');
  function openModal(html) { modalBox.innerHTML = html; modalRoot.style.display = 'flex'; document.body.classList.add('modal-open'); }
  function closeModal() { modalRoot.style.display = 'none'; modalBox.innerHTML = ''; document.body.classList.remove('modal-open'); }
  modalRoot.addEventListener('click', (e) => { if (e.target === modalRoot) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ---------- navigation ----------
  const loaders = {};
  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    loaders[name]?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeSidebar();
  }
  document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showView(el.dataset.view); }));
  const sidebar = $('sidebar');
  const backdrop = $('sidebar-backdrop');
  function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.remove('open'); }
  $('sidebar-toggle')?.addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.add('open'); });
  backdrop.addEventListener('click', closeSidebar);

  // ---------- pager ----------
  function renderPager(id, state, total, onPage) {
    const el = $(id);
    el.innerHTML = `<span>${total} result${total === 1 ? '' : 's'}. Page ${state.page} of ${state.pages}</span>
      <span class="pager-btns"><button class="btn btn-sm btn-soft" data-p="prev" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
      <button class="btn btn-sm btn-soft" data-p="next" ${state.page >= state.pages ? 'disabled' : ''}>Next</button></span>`;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      state.page += b.dataset.p === 'next' ? 1 : -1;
      onPage();
    }));
  }

  // =================================================== OVERVIEW ====
  async function loadProviderBalance() {
    const card = $('provider-card');
    const status = $('vtpass-status');
    status.textContent = 'Checking...';
    try {
      const r = await Api.get('/admin/provider-balance');
      $('vtpass-balance').textContent = formatNaira(r.balance);
      $('vtpass-open').href = r.dashboardUrl;
      $('vtpass-mode').textContent = r.mock ? 'mock data' : 'live';
      card.classList.toggle('low', !!r.low);
      status.textContent = (r.low
        ? `Low balance (below ${formatNaira(r.threshold)}). Top up your provider wallet or customer orders will start failing. `
        : 'Funds available for customer orders. ') + `Updated ${new Date(r.checkedAt).toLocaleTimeString('en-NG')}.`;
    } catch (err) {
      $('vtpass-balance').textContent = '—';
      status.textContent = err.message;
    }
  }
  $('vtpass-refresh').addEventListener('click', loadProviderBalance);
  $('provider-check-btn').addEventListener('click', async () => {
    const out = $('provider-check-out');
    out.style.display = 'block';
    out.textContent = 'Checking provider...';
    try { out.textContent = JSON.stringify(await Api.get('/admin/provider-check'), null, 2); } catch (err) { out.textContent = err.message; }
  });
  setInterval(() => { if (!document.hidden && $('view-overview').classList.contains('active')) loadProviderBalance(); }, 120000);

  function statCard(label, value, sub) {
    return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  }

  async function loadOverview() {
    loadProviderBalance();
    try {
      const s = await Api.get('/admin/stats');
      const a = s.attention;
      const attn = (n, label, view, filter) =>
        `<button class="attn-card ${n ? 'hot' : ''}" data-go="${view}" data-filter='${esc(JSON.stringify(filter || {}))}'><div class="n">${n}</div><div class="l">${esc(label)}</div></button>`;
      $('attn-grid').innerHTML =
        attn(a.pendingOrders, 'Orders still processing', 'transactions', { type: 'services', status: 'pending' }) +
        attn(a.failedOrders24h, 'Failed orders (24h)', 'transactions', { type: 'services', status: 'failed' }) +
        attn(a.pendingWithdrawals, 'Withdrawals to review', 'withdrawals') +
        attn(a.pendingA2C, 'Airtime-to-cash to review', 'airtime2cash');
      $('attn-grid').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
        const f = JSON.parse(b.dataset.filter || '{}');
        if (b.dataset.go === 'transactions') {
          $('tx-type').value = f.type || ''; $('tx-status').value = f.status || '';
          $('tx-q').value = ''; $('tx-from').value = ''; $('tx-to').value = '';
        }
        showView(b.dataset.go);
      }));

      const sales = (label, p) => statCard(label, formatNaira(p.sales), `${p.orders} order${p.orders === 1 ? '' : 's'} · profit ${formatNaira(p.profit)}${p.profitCoverage < 100 ? ` <span title="Profit only counts orders where the provider's price was recorded">(${p.profitCoverage}% of sales counted)</span>` : ''}`);
      $('sales-grid').innerHTML = sales('Today', s.today) + sales('Last 7 days', s.week) + sales('Last 30 days', s.month);

      const max = Math.max(...s.daily.map((d) => d.sales), 1);
      $('daily-chart').innerHTML = s.daily.length
        ? s.daily.map((d) => `<div class="bar-col" title="${esc(d.date)}: ${formatNaira(d.sales)} (${d.orders} orders)"><div class="bar" style="height:${Math.max((d.sales / max) * 100, 2)}%"></div><small>${esc(d.date.slice(5))}</small></div>`).join('')
        : '<div class="muted">No sales yet.</div>';

      $('by-service-body').innerHTML = s.byService.length
        ? s.byService.map((r) => `<tr><td>${esc(TYPE_LABELS[r.type] || r.type)}<small>${r.orders} orders</small></td><td style="text-align:right;"><strong>${formatNaira(r.sales)}</strong></td></tr>`).join('')
        : '<tr><td class="muted">No sales yet.</td></tr>';

      $('people-grid').innerHTML =
        statCard('Customers', s.totalUsers, `${s.newUsers7d} joined in the last 7 days`) +
        statCard('Money in customer wallets', formatNaira(s.walletFloat), 'What you owe customers') +
        statCard('All transactions', s.totalTransactions);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  loaders.overview = loadOverview;

  // =================================================== TRANSACTIONS ====
  const txState = { page: 1, pages: 1 };
  const txFilters = () => ({ q: $('tx-q').value.trim(), type: $('tx-type').value, status: $('tx-status').value, from: $('tx-from').value, to: $('tx-to').value });
  let txRows = [];

  async function loadTransactions() {
    try {
      const r = await Api.get(`/admin/transactions?${qs({ ...txFilters(), page: txState.page, limit: 25 })}`);
      txRows = r.transactions;
      txState.pages = r.pages; txState.page = r.page;
      $('admin-tx-body').innerHTML = r.transactions.map((t) => `
        <tr class="clickable" data-id="${esc(t.id)}">
          <td>${fmtDate(t.createdAt)}</td>
          <td>${esc(t.userName)}<small>${esc(t.userEmail)}</small></td>
          <td>${esc(t.description)}<small>${esc(t.reference || '')}</small></td>
          <td>${esc(TYPE_LABELS[t.type] || t.type)}</td>
          <td>${formatNaira(t.amount)}</td>
          <td>${badge(t.status)}${t.status === 'pending' && t.meta?.providerId ? '' : ''}</td>
          <td>${t.status === 'pending' && SERVICE_TYPES.includes(t.type)
            ? `<button class="btn btn-primary btn-sm tx-resolve" data-id="${esc(t.id)}" data-action="success">Mark paid</button> <button class="btn btn-danger btn-sm tx-resolve" data-id="${esc(t.id)}" data-action="refund">Refund</button>` : ''}</td>
        </tr>`).join('');
      $('admin-tx-empty').style.display = r.transactions.length ? 'none' : 'block';
      renderPager('tx-pager', txState, r.total, loadTransactions);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  $('admin-tx-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('.tx-resolve');
    if (btn) {
      e.stopPropagation();
      const refund = btn.dataset.action === 'refund';
      if (!confirm(refund ? 'Refund the customer and mark this order failed? Only do this after checking the provider did NOT deliver it.' : 'Mark this order as delivered? Only do this after checking the provider delivered it.')) return;
      try {
        const r = await Api.post(`/admin/transactions/${btn.dataset.id}/resolve`, { action: btn.dataset.action });
        toast(r.message);
        loadTransactions();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openTxDetail(row.dataset.id);
  });

  function openTxDetail(id) {
    const t = txRows.find((x) => x.id === id);
    if (!t) return;
    const m = t.meta || {};
    const metaRows = Object.entries(m).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !['token', 'cards'].includes(k))
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('');
    openModal(`
      <h3 class="rcpt-title">${esc(TYPE_LABELS[t.type] || t.type)}: ${formatNaira(t.amount)}</h3>
      <dl class="kv">
        <dt>Status</dt><dd>${badge(t.status)}</dd>
        <dt>Date</dt><dd>${fmtDate(t.createdAt)}</dd>
        <dt>Customer</dt><dd>${esc(t.userName)}<br>${esc(t.userEmail)}<br>${esc(t.userPhone)}</dd>
        <dt>Description</dt><dd>${esc(t.description)}</dd>
        <dt>Reference</dt><dd>${esc(t.reference || '')}</dd>
        <dt>Transaction ID</dt><dd>${esc(t.id)}</dd>
        ${m.providerCost != null ? `<dt>Provider charged</dt><dd>${formatNaira(m.providerCost)} <small>(profit ${formatNaira(t.amount - m.providerCost)})</small></dd>` : ''}
        ${m.token ? `<dt>Token / PIN</dt><dd>${esc(m.token)}</dd>` : ''}
        ${metaRows}
      </dl>
      <div class="modal-actions"><button class="btn btn-primary" id="tx-detail-close">Close</button></div>`);
    $('tx-detail-close').addEventListener('click', closeModal);
  }

  $('tx-apply').addEventListener('click', () => { txState.page = 1; loadTransactions(); });
  $('tx-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { txState.page = 1; loadTransactions(); } });
  $('tx-reset').addEventListener('click', () => { ['tx-q', 'tx-type', 'tx-status', 'tx-from', 'tx-to'].forEach((i) => ($(i).value = '')); txState.page = 1; loadTransactions(); });
  $('tx-export').addEventListener('click', () => Api.download(`/admin/transactions.csv?${qs(txFilters())}`, 'transactions.csv').catch((e) => toast(e.message, 'error')));
  loaders.transactions = loadTransactions;

  // =================================================== USERS ====
  const userState = { page: 1, pages: 1 };
  let userRows = [];
  async function loadUsers() {
    try {
      const r = await Api.get(`/admin/users?${qs({ q: $('user-q').value.trim(), status: $('user-status').value, page: userState.page, limit: 20 })}`);
      userRows = r.users;
      userState.pages = r.pages; userState.page = r.page;
      $('users-body').innerHTML = r.users.map((u) => `
        <tr class="clickable" data-id="${esc(u.id)}">
          <td>${esc(u.fullName)} ${u.isAdmin ? '<span class="badge badge-neutral">admin</span>' : ''} ${u.suspended ? '<span class="badge badge-danger">suspended</span>' : ''}</td>
          <td>${esc(u.email)}${u.emailVerified === false ? '<small>not verified</small>' : ''}</td>
          <td>${esc(u.phone)}</td>
          <td>${formatNaira(u.walletBalance)}</td>
          <td>${fmtDate(u.createdAt)}</td>
          <td><button class="btn btn-sm btn-soft">Manage</button></td>
        </tr>`).join('');
      $('users-empty').style.display = r.users.length ? 'none' : 'block';
      renderPager('users-pager', userState, r.total, loadUsers);
    } catch (err) { toast(err.message, 'error'); }
  }
  $('user-apply').addEventListener('click', () => { userState.page = 1; loadUsers(); });
  $('user-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { userState.page = 1; loadUsers(); } });
  $('users-body').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openUser(row.dataset.id);
  });
  loaders.users = loadUsers;

  async function openUser(id) {
    try {
      const d = await Api.get(`/admin/users/${id}`);
      const u = d.user;
      const self = u.id === user.id;
      openModal(`
        <h3 class="rcpt-title">${esc(u.fullName)}</h3>
        <dl class="kv">
          <dt>Email</dt><dd>${esc(u.email)} ${u.emailVerified === false ? '(not verified)' : ''}</dd>
          <dt>Phone</dt><dd>${esc(u.phone)}</dd>
          <dt>Wallet</dt><dd><strong>${formatNaira(u.walletBalance)}</strong></dd>
          <dt>Joined</dt><dd>${fmtDate(u.createdAt)}</dd>
          <dt>Orders</dt><dd>${d.orders} successful, ${formatNaira(d.totalSpent)} spent</dd>
          <dt>Status</dt><dd>${u.suspended ? `Suspended${u.suspendedReason ? `: ${esc(u.suspendedReason)}` : ''}` : 'Active'}${u.isAdmin ? ', admin' : ''}</dd>
        </dl>
        <h4 class="sub-title">Latest activity</h4>
        <div class="table-scroll" style="max-height:200px;overflow:auto;"><table class="tx-table compact"><tbody>
          ${d.recent.map((t) => `<tr><td>${esc(t.description)}<small>${fmtDate(t.createdAt)}</small></td><td>${formatNaira(t.amount)}</td><td>${badge(t.status)}</td></tr>`).join('') || '<tr><td class="muted">No activity.</td></tr>'}
        </tbody></table></div>
        <div class="modal-actions wrap">
          <button class="btn btn-soft" id="u-adjust">Adjust wallet</button>
          ${self ? '' : `<button class="btn ${u.suspended ? 'btn-primary' : 'btn-danger'}" id="u-suspend">${u.suspended ? 'Reactivate' : 'Suspend'}</button>
          <button class="btn btn-soft" id="u-admin">${u.isAdmin ? 'Remove admin' : 'Make admin'}</button>`}
          <button class="btn btn-primary" id="u-close">Close</button>
        </div>`);
      $('u-close').addEventListener('click', closeModal);
      $('u-adjust').addEventListener('click', async () => {
        const amount = prompt('Amount in naira. Use a minus sign to take money off (e.g. -500).');
        if (amount === null || !Number(amount)) return;
        const reason = prompt('Reason (kept in the log):', 'Manual adjustment');
        if (reason === null) return;
        try { const r = await Api.post(`/admin/users/${id}/wallet-adjust`, { amount: Number(amount), reason }); toast(r.message); openUser(id); loadUsers(); }
        catch (err) { toast(err.message, 'error'); }
      });
      $('u-suspend')?.addEventListener('click', async () => {
        const suspend = !u.suspended;
        const reason = suspend ? prompt('Reason for suspending (optional):', '') : '';
        if (suspend && reason === null) return;
        try { const r = await Api.post(`/admin/users/${id}/suspend`, { suspended: suspend, reason }); toast(r.message); closeModal(); loadUsers(); }
        catch (err) { toast(err.message, 'error'); }
      });
      $('u-admin')?.addEventListener('click', async () => {
        if (!confirm(u.isAdmin ? 'Remove admin access from this user?' : 'Give this user FULL admin access?')) return;
        try { const r = await Api.post(`/admin/users/${id}/admin`, { isAdmin: !u.isAdmin }); toast(r.message); closeModal(); loadUsers(); }
        catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { toast(err.message, 'error'); }
  }

  // =================================================== SERVICES & PLANS ====
  let sc = null;
  let scNetwork = 'mtn';

  const switchHtml = (type, key, on, label, sub) => `
    <label class="switch-row"><span><strong>${esc(label)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="switch"><input type="checkbox" data-type="${type}" data-key="${esc(key)}" ${on ? 'checked' : ''} /><span class="slider"></span></span></label>`;

  // Services shown as a checklist, grouped. Tick = ON for customers.
  const CHECK_GROUPS = [
    { title: 'Buying', items: [
      ['airtime', 'Airtime'], ['data', 'Data'], ['electricity', 'Electricity bills'], ['cable', 'Cable TV'],
      ['exam', 'Exam PINs', 'Off until you have tested one purchase.']] },
    { title: 'Wallet & payments', items: [
      ['funding', 'Wallet funding and "pay with card / transfer" at checkout', 'Turn off to make customers pay from their wallet only.'],
      ['transfer', 'Wallet-to-wallet transfers']] },
    { title: 'Withdrawals', items: [
      ['withdrawal', 'Withdrawals (paid manually by you)', 'Turn off and customers lose the Withdraw page AND the bank-account settings. Existing requests stay in Admin > Withdrawals.']] },
    { title: 'Airtime to cash', items: [
      ['airtime-to-cash', 'Airtime to cash (you check and approve each one)', 'Turn off to remove the whole Airtime-to-Cash page.'],
      ['airtime-to-cash-auto', 'Automatic verification option', 'NOT connected to any provider yet, so it is OFF. Even if ticked it falls back to manual review unless AIRTIME2CASH_API_URL is set.']] }
  ];

  function renderChecklist() {
    const on = Object.fromEntries(sc.services.map((s) => [s.key, s.on]));
    $('sc-services').innerHTML = CHECK_GROUPS.map((g) => `
      <div class="check-group"><div class="check-group-title">${esc(g.title)}</div>
        ${g.items.map(([key, label, note]) => `
          <label class="check-item"><input type="checkbox" data-type="service" data-key="${esc(key)}" ${on[key] ? 'checked' : ''} />
            <span><strong>${esc(label)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</span></label>`).join('')}
      </div>`).join('');
  }

  function renderServices() {
    $('site-maintenance').checked = sc.site.maintenance;
    $('site-maintenance-msg').value = sc.site.maintenanceMessage || '';
    $('site-notice-input').value = sc.site.notice || '';
    $('site-app-enabled').checked = sc.site.appDownloadEnabled !== false;
    $('site-app-url').value = sc.site.appDownloadUrl || '';
    $('site-email-orders').checked = sc.site.emailOrders !== false;
    $('site-email-logins').checked = sc.site.emailLogins !== false;
    $('site-email-admin').checked = sc.site.emailAdminAlerts !== false;

    renderChecklist();
    $('sc-networks').innerHTML = sc.networks.map((n) => switchHtml('network', n.key, n.on, NETWORK_NAMES[n.key])).join('');

    $('sc-data-tabs').innerHTML = Object.keys(NETWORK_NAMES).map((n) => `<button type="button" class="chip ${n === scNetwork ? 'active' : ''}" data-net="${n}">${NETWORK_NAMES[n]}</button>`).join('');
    const d = sc.data[scNetwork] || { categories: [], plans: [] };
    $('sc-data-cats').innerHTML = d.categories.length
      ? d.categories.map((c) => switchHtml('category', `${scNetwork}|${c.name}`, c.on, titleCase(c.name), `${c.count} plans. Turning this off hides every plan of this type.`)).join('')
      : '<p class="muted">No plans returned by the provider for this network.</p>';
    renderPlanList();

    $('sc-discos').innerHTML = sc.discos.length ? sc.discos.map((x) => switchHtml('disco', x.id, x.on, x.name)).join('') : '<p class="muted">The provider returned no electricity companies.</p>';
    $('sc-cables').innerHTML = sc.cables.map((c) => `
      ${switchHtml('cable', c.key, c.on, c.key.toUpperCase(), `${c.plans.length} packages`)}
      <details style="margin:4px 0 10px;"><summary class="muted" style="cursor:pointer;">Packages</summary><div class="switch-list">
        ${c.plans.map((p) => switchHtml('plan', `cable:${p.id}`, p.on, p.name, formatNaira(p.amount))).join('')}</div></details>`).join('');
    $('sc-exam').innerHTML = sc.exam.length ? sc.exam.map((p) => switchHtml('plan', `exam:${p.id}`, p.on, p.name, formatNaira(p.amount))).join('') : '<p class="muted">The provider lists no exam PINs.</p>';
  }

  function visiblePlans() {
    const q = $('sc-plan-q').value.trim().toLowerCase();
    return (sc.data[scNetwork]?.plans || []).filter((p) => !q || `${p.name} ${p.category} ${p.amount}`.toLowerCase().includes(q));
  }
  function renderPlanList() {
    const list = visiblePlans();
    $('sc-data-plans').innerHTML = list.length
      ? list.map((p) => switchHtml('plan', `data:${p.id}`, p.on, `${p.name}`, `${titleCase(p.category)} · ${formatNaira(p.amount)}`)).join('')
      : '<p class="muted">No plans match.</p>';
  }

  async function loadServices() {
    try {
      sc = await Api.get('/admin/service-control');
      renderServices();
    } catch (err) { toast(err.message, 'error'); }
  }
  loaders.services = loadServices;

  async function toggle(type, keys, enabled) {
    await Api.post('/admin/service-control/toggle', { type, keys, enabled });
  }

  $('view-services').addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-type]');
    if (!input) return;
    const { type, key } = input.dataset;
    try {
      await toggle(type, [key], input.checked);
      toast(input.checked ? 'Turned on.' : 'Turned off.');
      await loadServices();
    } catch (err) {
      input.checked = !input.checked;
      toast(err.message, 'error');
    }
  });
  $('sc-data-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-net]');
    if (!b) return;
    scNetwork = b.dataset.net;
    renderServices();
  });
  $('sc-plan-q').addEventListener('input', renderPlanList);
  async function bulkPlans(enabled) {
    const keys = visiblePlans().map((p) => `data:${p.id}`);
    if (!keys.length) return;
    if (!confirm(`Turn ${enabled ? 'ON' : 'OFF'} ${keys.length} plan(s)?`)) return;
    try { await toggle('plan', keys, enabled); toast('Done.'); loadServices(); } catch (err) { toast(err.message, 'error'); }
  }
  $('sc-plans-off').addEventListener('click', () => bulkPlans(false));
  $('sc-plans-on').addEventListener('click', () => bulkPlans(true));

  $('site-save').addEventListener('click', async () => {
    try {
      await Api.put('/admin/site', {
        maintenance: $('site-maintenance').checked,
        maintenanceMessage: $('site-maintenance-msg').value,
        notice: $('site-notice-input').value,
        appDownloadEnabled: $('site-app-enabled').checked,
        appDownloadUrl: $('site-app-url').value.trim(),
        emailOrders: $('site-email-orders').checked,
        emailLogins: $('site-email-logins').checked,
        emailAdminAlerts: $('site-email-admin').checked
      });
      toast('Saved.');
    } catch (err) { toast(err.message, 'error'); }
  });

  // =================================================== WITHDRAWALS ====
  async function loadWithdrawals() {
    try {
      const { withdrawals } = await Api.get('/admin/withdrawals');
      $('withdrawals-body').innerHTML = withdrawals.map((w) => `
        <tr>
          <td>${esc(w.userName)}<small>${esc(w.userEmail)}</small></td>
          <td>${formatNaira(w.amount)}</td>
          <td><strong>${esc(w.accountName)}</strong><small>${esc(w.bankName)} · <span class="mono">${esc(w.accountNumber)}</span></small>
            <button class="btn btn-sm btn-soft" data-copy="${esc(`${w.bankName} | ${w.accountNumber} | ${w.accountName} | ${w.amount}`)}">Copy details</button></td>
          <td>${w.status === 'processing' ? '<span class="badge badge-neutral">processing</span>' : badge(w.status)}${w.adminNote ? `<small>${esc(w.adminNote)}</small>` : ''}${w.processedBy?.email ? `<small>by ${esc(w.processedBy.email)}</small>` : ''}</td>
          <td>${fmtDate(w.createdAt)}</td>
          <td>${w.status === 'pending' ? `<button class="btn btn-soft btn-sm" data-wa="processing" data-id="${esc(w.id)}">Start processing</button> ` : ''}${w.status === 'pending' || w.status === 'processing' ? `<button class="btn btn-primary btn-sm" data-wa="approve" data-id="${esc(w.id)}">Mark paid</button> <button class="btn btn-danger btn-sm" data-wa="reject" data-id="${esc(w.id)}">Reject</button>` : ''}</td>
        </tr>`).join('');
      $('withdrawals-empty').style.display = withdrawals.length ? 'none' : 'block';
    } catch (err) { toast(err.message, 'error'); }
  }
  $('withdrawals-body').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Bank details copied.'); } catch (err) { toast('Could not copy.', 'error'); }
      return;
    }
    const b = e.target.closest('[data-wa]');
    if (!b) return;
    const action = b.dataset.wa;
    let note = '';
    if (action === 'approve') {
      note = prompt('You have sent the money. Add the payment reference or a note for the customer (optional):', '');
      if (note === null) return;
    } else if (action === 'reject') {
      note = prompt('Reason for rejecting. The customer sees this and the full amount goes back to their wallet:', '');
      if (note === null) return;
    } else if (!confirm('Tell the customer their money is being sent now?')) return;
    try { const r = await Api.post(`/admin/withdrawals/${b.dataset.id}/${action}`, { note }); toast(r.message); loadWithdrawals(); }
    catch (err) { toast(err.message, 'error'); }
  });
  loaders.withdrawals = loadWithdrawals;

  // =================================================== AIRTIME TO CASH ====
  async function loadA2C() {
    try {
      const { requests } = await Api.get('/admin/airtime-to-cash');
      $('a2c-body').innerHTML = requests.map((r) => `
        <tr>
          <td>${esc(r.userName)}<small>${esc(r.userEmail)}</small></td>
          <td>${esc((r.network || '').toUpperCase())}</td>
          <td>${formatNaira(r.amountSent)}</td>
          <td>${formatNaira(r.cashValue)}</td>
          <td>${esc(r.phoneUsed || '')}</td>
          <td>${esc(r.method || '')}</td>
          <td>${badge(r.status)}${r.adminNote ? `<small>${esc(r.adminNote)}</small>` : ''}</td>
          <td>${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-aa="approve" data-id="${esc(r.id)}">Approve</button> <button class="btn btn-danger btn-sm" data-aa="reject" data-id="${esc(r.id)}">Reject</button>` : ''}</td>
        </tr>`).join('');
      $('a2c-empty').style.display = requests.length ? 'none' : 'block';
    } catch (err) { toast(err.message, 'error'); }
  }
  $('a2c-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-aa]');
    if (!b) return;
    const approve = b.dataset.aa === 'approve';
    if (approve && !confirm('Only approve after you have confirmed the airtime arrived. This credits the user\'s wallet. Continue?')) return;
    const note = prompt(approve ? 'Note (optional):' : 'Reason for rejecting:', '');
    if (note === null) return;
    try { const r = await Api.post(`/admin/airtime-to-cash/${b.dataset.id}/${b.dataset.aa}`, { note }); toast(r.message); loadA2C(); }
    catch (err) { toast(err.message, 'error'); }
  });
  loaders.airtime2cash = loadA2C;

  // =================================================== PRICING ====
  async function loadPricing() {
    try {
      const { pricing: p } = await Api.get('/admin/pricing');
      $('markup-airtime').value = p.airtime.markupPercent;
      $('markup-data').value = p.data.markupPercent;
      $('markup-electricity').value = p.electricity.markupPercent;
      $('markup-cable').value = p.cable.markupPercent;
      $('exam-fee').value = p.exam.flatFee;
      $('a2c-rate').value = p.airtimeToCash.ratePercent;
      $('min-withdrawal').value = p.withdrawal.minAmount;
    } catch (err) { toast(err.message, 'error'); }
  }
  $('pricing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.put('/admin/pricing', {
        airtime: { markupPercent: Number($('markup-airtime').value) },
        data: { markupPercent: Number($('markup-data').value) },
        electricity: { markupPercent: Number($('markup-electricity').value) },
        cable: { markupPercent: Number($('markup-cable').value) },
        exam: { flatFee: Number($('exam-fee').value) },
        airtimeToCash: { ratePercent: Number($('a2c-rate').value) },
        withdrawal: { minAmount: Number($('min-withdrawal').value) }
      });
      toast('Pricing saved.');
    } catch (err) { toast(err.message, 'error'); }
  });
  loaders.pricing = loadPricing;

  // =================================================== ANNOUNCEMENTS ====
  const annBody = () => ({
    audience: $('ann-audience').value,
    email: $('ann-email').value.trim(),
    title: $('ann-title').value.trim(),
    message: $('ann-message').value.trim(),
    buttonText: $('ann-btn-text').value.trim(),
    buttonUrl: $('ann-btn-url').value.trim(),
    sendEmail: $('ann-email-on').checked,
    sendPopup: $('ann-popup-on').checked
  });

  function renderPreview() {
    $('prev-title').textContent = $('ann-title').value.trim() || 'Your title';
    $('prev-message').innerHTML = esc($('ann-message').value.trim() || 'Your message appears here.').replace(/\n/g, '<br>');
    const t = $('ann-btn-text').value.trim();
    $('prev-btn').style.display = t ? 'inline-block' : 'none';
    $('prev-btn').textContent = t;
    $('ann-count').textContent = `${$('ann-message').value.length} / 2000`;
  }
  ['ann-title', 'ann-message', 'ann-btn-text'].forEach((id) => $(id).addEventListener('input', renderPreview));

  let audienceCount = 0;
  async function refreshAudience() {
    const one = $('ann-audience').value === 'user';
    $('ann-email-field').style.display = one ? 'block' : 'none';
    try {
      const email = one ? $('ann-email').value.trim() : '';
      if (one && !email) { $('ann-audience-hint').textContent = ''; audienceCount = 0; return; }
      const r = await Api.get(`/admin/announcements/audience${one ? `?email=${encodeURIComponent(email)}` : ''}`);
      audienceCount = r.count;
      $('ann-audience-hint').textContent = one
        ? (r.count ? `Found: ${r.name}` : 'No customer has this email.')
        : `This will reach ${r.count} customer${r.count === 1 ? '' : 's'} (verified and not suspended).`;
    } catch (e) { /* ignore */ }
  }
  $('ann-audience').addEventListener('change', refreshAudience);
  $('ann-email').addEventListener('change', refreshAudience);

  async function loadAnnouncements() {
    renderPreview();
    refreshAudience();
    try {
      const { announcements } = await Api.get('/admin/announcements');
      $('ann-body').innerHTML = announcements.map((a) => `
        <tr>
          <td>${fmtDate(a.createdAt)}</td>
          <td><strong>${esc(a.title)}</strong><small>${esc(String(a.message).slice(0, 80))}${a.message.length > 80 ? '...' : ''}</small></td>
          <td>${a.audience === 'all' ? 'All customers' : esc(a.targetEmail)}<small>${a.stats?.recipients ?? 0} customer(s)</small></td>
          <td>${a.sendEmail ? `${a.stats?.emailsSent ?? 0} sent${a.stats?.emailsFailed ? `, <span style="color:var(--danger)">${a.stats.emailsFailed} failed</span>` : ''}` : 'off'}</td>
          <td>${a.sendPopup ? a.stats?.popups ?? 0 : 'off'}</td>
          <td>${esc(a.createdBy?.email || '')}</td>
          <td>${a.status === 'done' ? badge('success') : '<span class="badge badge-neutral">sending</span>'}</td>
        </tr>`).join('');
      $('ann-empty').style.display = announcements.length ? 'none' : 'block';
      return announcements;
    } catch (err) { toast(err.message, 'error'); return []; }
  }

  $('ann-test').addEventListener('click', async () => {
    try { const r = await Api.post('/admin/announcements/test', annBody()); toast(r.message); }
    catch (err) { toast(err.message, 'error'); }
  });

  $('ann-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = annBody();
    await refreshAudience();
    if (!audienceCount) return toast(body.audience === 'user' ? 'No customer has that email.' : 'There are no customers to send to.', 'error');
    const how = [body.sendEmail && 'email', body.sendPopup && 'popup'].filter(Boolean).join(' + ');
    if (!confirm(`Send "${body.title}" to ${audienceCount} customer${audienceCount === 1 ? '' : 's'} by ${how}?\n\nThis cannot be undone.`)) return;
    try {
      const r = await Api.post('/admin/announcements', body);
      toast(r.message);
      $('ann-form').reset();
      renderPreview();
      refreshAudience();
      // watch the sending progress for a while
      let tries = 0;
      const timer = setInterval(async () => {
        const list = await loadAnnouncements();
        tries += 1;
        if (tries > 20 || !list.some((a) => a.status !== 'done')) clearInterval(timer);
      }, 4000);
      loadAnnouncements();
    } catch (err) { toast(err.message, 'error'); }
  });
  loaders.announcements = loadAnnouncements;

  // =================================================== LOGS ====
  const logState = { page: 1, pages: 1 };
  const logFilters = () => ({ q: $('log-q').value.trim(), category: $('log-category').value, level: $('log-level').value, from: $('log-from').value, to: $('log-to').value });
  async function loadLogs() {
    try {
      const r = await Api.get(`/admin/logs?${qs({ ...logFilters(), page: logState.page, limit: 50 })}`);
      logState.pages = r.pages; logState.page = r.page;
      $('logs-body').innerHTML = r.logs.map((l, i) => `
        <tr class="clickable" data-i="${i}">
          <td>${fmtDate(l.createdAt)}</td>
          <td><span class="pill ${esc(l.level)}">${esc(l.level)}</span></td>
          <td>${esc(l.category)}</td>
          <td>${esc(l.message)}<small>${esc(l.action)}</small></td>
          <td>${esc(l.userEmail || '')}${l.actorEmail ? `<small>by admin ${esc(l.actorEmail)}</small>` : ''}${l.ip ? `<small>${esc(l.ip)}</small>` : ''}</td>
        </tr>
        <tr class="log-detail" id="logd-${i}"><td colspan="5">${esc(JSON.stringify(l.meta || {}, null, 2))}</td></tr>`).join('');
      $('logs-empty').style.display = r.logs.length ? 'none' : 'block';
      renderPager('logs-pager', logState, r.total, loadLogs);
    } catch (err) { toast(err.message, 'error'); }
  }
  $('logs-body').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-i]');
    if (row) $(`logd-${row.dataset.i}`)?.classList.toggle('open');
  });
  $('log-apply').addEventListener('click', () => { logState.page = 1; loadLogs(); });
  $('log-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { logState.page = 1; loadLogs(); } });
  $('log-reset').addEventListener('click', () => { ['log-q', 'log-category', 'log-level', 'log-from', 'log-to'].forEach((i) => ($(i).value = '')); logState.page = 1; loadLogs(); });
  $('log-export').addEventListener('click', () => Api.download(`/admin/logs.csv?${qs(logFilters())}`, 'activity-log.csv').catch((e) => toast(e.message, 'error')));
  loaders.logs = loadLogs;

  // =================================================== SYSTEM ====
  async function loadSystem() {
    try {
      const { checks } = await Api.get('/admin/system');
      $('system-checks').innerHTML = checks.map((c) => `
        <div class="check-row"><span class="left"><span class="dot ${c.ok ? '' : 'bad'}"></span>${esc(c.label)}</span><span class="val">${esc(c.value)}</span></div>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }
  $('system-refresh').addEventListener('click', loadSystem);
  loaders.system = loadSystem;

  // ---------- start ----------
  renderUser();
  refreshUser();
  // links in alert emails look like admin.html#withdrawals
  const startView = (location.hash || '').replace('#', '');
  if (startView && $(`view-${startView}`)) showView(startView); else loadOverview();
  window.addEventListener('hashchange', () => { const v = (location.hash || '').replace('#', ''); if (v && $(`view-${v}`)) showView(v); });
})();
