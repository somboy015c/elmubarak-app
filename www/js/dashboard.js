(function () {
  if (!Api.isLoggedIn()) {
    location.replace('login.html');
    return;
  }

  let user = Api.currentUser();
  const markups = { airtime: 0, electricity: 0 };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const withMarkup = (amount, pct) => Math.round(Number(amount) * (1 + Number(pct) / 100) * 100) / 100;

  // ---- View switching ----
  function showView(name) {
    const gate = document.querySelector(`.nav-item[data-view="${name}"][data-service]`);
    if (gate && gate.dataset.off === '1') {
      toast('That service is currently unavailable.', 'error');
      return;
    }
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    if (name === 'transactions') loadFullTransactions();
    if (name === 'notices') loadNotices(true);
    if (name === 'settings') { loadSecurityStatus(); loadBanks(); }
    if (name === 'withdraw') loadWithdrawInfo();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeSidebar();
  }

  document.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      showView(el.dataset.view);
    });
  });

  // ---- Mobile off-canvas drawer ----
  const sidebar = $('sidebar');
  const sidebarBackdrop = $('sidebar-backdrop');
  const sidebarToggle = $('sidebar-toggle');

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('open');
  }
  sidebarToggle?.addEventListener('click', openSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  $('logout-btn').addEventListener('click', () => Api.logout());

  // ---- Header / wallet (with hide-balance toggle, like banking apps) ----
  const EYE_ON = '<svg class="icon" viewBox="0 0 24 24" style="width:18px;height:18px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg class="icon" viewBox="0 0 24 24" style="width:18px;height:18px;"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  let balanceHidden = localStorage.getItem('hide_balance') === '1';

  function money(v) {
    return balanceHidden ? '₦ ••••••' : formatNaira(v);
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function renderUser() {
    const firstName = user.fullName?.split(' ')[0] || 'there';
    const initial = (user.fullName || 'U').trim().charAt(0).toUpperCase();

    $('admin-link').style.display = user.isAdmin ? 'flex' : 'none';

    $('sidebar-avatar').textContent = initial;
    $('sidebar-username').textContent = user.fullName || 'there';
    $('sidebar-balance').textContent = money(user.walletBalance);

    $('topbar-avatar').textContent = initial;
    $('topbar-username').textContent = user.fullName || 'there';
    $('topbar-balance').textContent = money(user.walletBalance);

    $('mobile-profile-avatar').textContent = initial;
    $('wallet-greet').textContent = `${greeting()}, ${firstName}`;
    $('wallet-balance').textContent = money(user.walletBalance);
    $('balance-eye').innerHTML = balanceHidden ? EYE_OFF : EYE_ON;
    $('balance-eye').setAttribute('aria-label', balanceHidden ? 'Show balance' : 'Hide balance');
  }

  $('balance-eye').addEventListener('click', () => {
    balanceHidden = !balanceHidden;
    localStorage.setItem('hide_balance', balanceHidden ? '1' : '0');
    renderUser();
  });

  async function refreshUser() {
    try {
      const data = await Api.get('/auth/me');
      user = data.user;
      Api.setSession(localStorage.getItem('almubarak_token'), user);
      renderUser();
    } catch (err) {
      /* handled by Api (redirects on 401) */
    }
  }

  function setUser(u) {
    if (!u) return;
    user = u;
    Api.setSession(localStorage.getItem('almubarak_token'), user);
    renderUser();
  }

  // ---- Admin-only: provider wallet balance strip on home ----
  async function loadProviderStrip() {
    if (!user.isAdmin) return;
    const strip = $('provider-strip');
    strip.style.display = 'flex';
    try {
      const r = await Api.get('/admin/provider-balance');
      $('provider-strip-balance').textContent = formatNaira(r.balance);
      $('provider-strip-note').textContent = r.low
        ? `Low balance. Top up your provider wallet or customers' orders will fail.`
        : r.mock ? 'Test mode (mock data)' : 'Live from provider';
      strip.classList.toggle('low', !!r.low);
    } catch (err) {
      $('provider-strip-balance').textContent = '—';
      $('provider-strip-note').textContent = err.message;
    }
  }

  // ---- Modal helpers ----
  const modalRoot = $('modal-root');
  const modalBox = $('modal-box');
  function openModal(html) {
    modalBox.innerHTML = html;
    modalRoot.style.display = 'flex';
    document.body.classList.add('modal-open');
  }
  function closeModal() {
    modalRoot.style.display = 'none';
    modalBox.innerHTML = '';
    document.body.classList.remove('modal-open');
  }
  modalRoot.addEventListener('click', (e) => { if (e.target === modalRoot && !modalRoot.dataset.locked) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalRoot.dataset.locked) closeModal(); });

  const ICON_OK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  const rowsHtml = (rows) =>
    rows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '')
      .map(([k, v]) => `<div class="rcpt-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');

  function tokenHtml(token, cards) {
    let out = '';
    if (token) {
      out += `<div class="token-box"><div class="token-label">Token / PIN</div><div class="token-value" id="rcpt-token">${esc(token)}</div><button type="button" class="chip" id="copy-token">Copy</button></div>`;
    }
    if (Array.isArray(cards) && cards.length) {
      out += cards.map((c) => `<div class="token-box"><div class="token-label">${esc(Object.keys(c).join(' / '))}</div><div class="token-value">${esc(Object.values(c).join(' / '))}</div></div>`).join('');
    }
    return out;
  }

  // Receipt for a finished (success / pending / failed) order or past transaction
  function showReceipt({ state, title, message, amount, rows, token, cards, reference, date }) {
    const icon = state === 'success' ? ICON_OK : state === 'pending' ? ICON_CLOCK : ICON_X;
    const headline = title || (state === 'success' ? 'Successful' : state === 'pending' ? 'Processing' : 'Failed');
    const allRows = [...rows, ['Reference', reference], ['Date', date || new Date().toLocaleString('en-NG')]];
    modalRoot.dataset.locked = '';
    openModal(`
      <div class="rcpt-icon ${state}">${icon}</div>
      <h3 class="rcpt-title">${esc(headline)}</h3>
      ${amount !== undefined ? `<div class="rcpt-amount">${formatNaira(amount)}</div>` : ''}
      ${message ? `<p class="rcpt-msg">${esc(message)}</p>` : ''}
      ${tokenHtml(token, cards)}
      <div class="rcpt-rows">${rowsHtml(allRows)}</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" id="rcpt-share">Copy receipt</button>
        <button type="button" class="btn btn-accent" id="rcpt-done">Done</button>
      </div>`);
    $('rcpt-done').addEventListener('click', closeModal);
    $('copy-token')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('rcpt-token').textContent); toast('Copied.'); } catch (e) { toast('Could not copy.', 'error'); }
    });
    $('rcpt-share').addEventListener('click', async () => {
      const text = `Elmubarak Digital Hub receipt\n${allRows.filter((r) => r[1]).map(([k, v]) => `${k}: ${v}`).join('\n')}${token ? `\nToken: ${token}` : ''}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('Receipt copied.'); }
      } catch (e) { /* cancelled */ }
    });
  }

  // ---- What the admin has switched on/off ----
  let siteStatus = null;

  function applyStatus(st) {
    siteStatus = st;
    const banner = $('maintenance-banner');
    banner.style.display = st.maintenance ? 'block' : 'none';
    banner.textContent = st.maintenance ? st.maintenanceMessage : '';
    const notice = $('site-notice');
    notice.style.display = st.notice ? 'block' : 'none';
    notice.textContent = st.notice || '';

    document.querySelectorAll('[data-service]').forEach((el) => {
      const on = st.services[el.dataset.service] !== false;
      el.dataset.off = on ? '0' : '1';
      el.style.display = on ? '' : 'none'; // switched off = removed from the page
    });
    document.querySelectorAll('#airtime-network option, #data-network option').forEach((o) => {
      if (o.value && st.networks[o.value] === false) { o.hidden = true; o.disabled = true; }
      else if (o.value) { o.hidden = false; o.disabled = false; }
    });
    document.querySelectorAll('#cable-provider option').forEach((o) => {
      if (o.value && st.cables[o.value] === false) { o.hidden = true; o.disabled = true; }
      else if (o.value) { o.hidden = false; o.disabled = false; }
    });

    // If the page they are on was just switched off, send them home.
    const active = document.querySelector('.view.active');
    const navBtn = active && document.querySelector(`.nav-item[data-view="${active.id.replace('view-', '')}"][data-service]`);
    if (navBtn && navBtn.dataset.off === '1') showView('home');
  }

  async function loadStatus() {
    try {
      applyStatus(await Api.get('/services/status'));
    } catch (err) {
      /* keep what is already shown */
    }
  }

  // Review -> choose how to pay -> process -> receipt. Used by every purchase.
  // submit(payWith) must call the API with { ..., payWith } and return its response.
  function confirmPurchase({ title, rows, price, submit, onDone, onNeedFunds }) {
    const balance = Number(user.walletBalance);
    const short = balance < price;
    const cardOk = !siteStatus || siteStatus.services.funding !== false;
    const defaultMethod = short ? (cardOk ? 'flutterwave' : '') : 'wallet';
    modalRoot.dataset.locked = '';
    openModal(`
      <h3 class="rcpt-title">${esc(title)}</h3>
      <p class="rcpt-msg">Please review the details, then choose how to pay.</p>
      <div class="rcpt-rows">
        ${rowsHtml(rows)}
        <div class="rcpt-row total"><span>You pay</span><strong>${formatNaira(price)}</strong></div>
      </div>
      <div class="pay-methods" id="pay-methods">
        <label class="pay-method ${short ? 'disabled' : ''}">
          <input type="radio" name="paywith" value="wallet" ${short ? 'disabled' : ''} ${defaultMethod === 'wallet' ? 'checked' : ''} />
          <span class="pm-body"><strong>Wallet</strong><small>${short ? `Balance ${formatNaira(balance)}: not enough for this purchase` : `Balance ${formatNaira(balance)}`}</small></span>
        </label>
        ${cardOk ? `<label class="pay-method">
          <input type="radio" name="paywith" value="flutterwave" ${defaultMethod === 'flutterwave' ? 'checked' : ''} />
          <span class="pm-body"><strong>Card, bank transfer or USSD</strong><small>Pay ${formatNaira(price)} securely with Flutterwave</small></span>
        </label>` : ''}
      </div>
      ${short && !cardOk ? `<div class="notice-box">Your wallet balance is too low for this purchase. <button type="button" id="cp-fund">Fund wallet</button></div>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" id="cp-cancel">Cancel</button>
        <button type="button" class="btn btn-accent" id="cp-confirm" ${defaultMethod ? '' : 'disabled'}>Pay ${formatNaira(price)}</button>
      </div>`);

    $('cp-cancel').addEventListener('click', closeModal);
    $('cp-fund')?.addEventListener('click', () => { closeModal(); showView('fund'); });
    $('cp-confirm').addEventListener('click', async () => {
      const chosen = document.querySelector('input[name="paywith"]:checked');
      if (!chosen) return toast('Choose how you want to pay.', 'error');
      const payWith = chosen.value;
      const btn = $('cp-confirm');
      btn.disabled = true;
      btn.textContent = payWith === 'flutterwave' ? 'Opening payment...' : 'Processing...';
      modalRoot.dataset.locked = '1'; // can't dismiss mid-payment
      try {
        const data = await submit(payWith);

        if (data.checkout) {
          // Pay-with-Flutterwave: go to the secure checkout; the order runs once payment is confirmed.
          localStorage.setItem('pending_funding_ref', data.reference);
          if (data.mock) {
            const v = await Api.post('/wallet/fund/verify', { reference: data.reference });
            localStorage.removeItem('pending_funding_ref');
            setUser(v.user);
            if (v.order) receiptFromOrder(v.order);
            onDone?.();
            loadHomeTransactions();
            return;
          }
          location.href = data.authorization_url;
          return;
        }

        setUser(data.user);
        showReceipt({
          state: data.pending ? 'pending' : 'success',
          message: data.message,
          amount: price,
          rows: [['Service', title], ...rows, ['Paid with', 'Wallet']],
          token: data.token,
          cards: data.cards,
          reference: data.reference
        });
        onDone?.();
        loadHomeTransactions();
      } catch (err) {
        if (err.data?.user) setUser(err.data.user);
        showReceipt({
          state: 'failed',
          message: err.message,
          amount: price,
          rows: [['Service', title], ...rows],
          reference: ''
        });
        if (err.code === 'INSUFFICIENT_BALANCE') onNeedFunds?.();
        if (err.code === 'SERVICE_DISABLED') loadStatus();
      }
    });
  }

  // Receipt for an order that was paid through Flutterwave
  function receiptFromOrder(order) {
    showReceipt({
      state: order.state === 'success' ? 'success' : order.state === 'pending' ? 'pending' : 'failed',
      message: order.message,
      amount: order.amount,
      rows: [['Service', order.description], ['Paid with', 'Flutterwave']],
      token: order.token,
      cards: order.cards,
      reference: order.reference
    });
  }

  // ---- Notices from the admin: popup + list ----
  let notices = [];
  let popupShowing = false;
  const nl2br = (t) => esc(t).replace(/\n/g, '<br>');

  function noticeLink(url) {
    return /^https?:\/\//i.test(url) ? { href: url, external: true } : { href: url, external: false };
  }

  function renderNoticeList() {
    $('notices-list').innerHTML = notices.map((n) => `
      <div class="card notice-item ${n.read ? '' : 'unread'}">
        <div class="notice-item-head"><strong>${esc(n.title)}</strong><small>${new Date(n.createdAt).toLocaleString('en-NG')}</small></div>
        <p>${nl2br(n.message)}</p>
        ${n.buttonText && n.buttonUrl ? `<a class="btn btn-accent btn-sm" href="${esc(n.buttonUrl)}" ${noticeLink(n.buttonUrl).external ? 'target="_blank" rel="noopener"' : ''}>${esc(n.buttonText)}</a>` : ''}
      </div>`).join('');
    $('notices-empty').style.display = notices.length ? 'none' : 'block';
    const unread = notices.filter((n) => !n.read).length;
    $('notice-dot').style.display = unread ? 'inline-block' : 'none';
    $('notice-dot').textContent = unread > 9 ? '9+' : String(unread);
  }

  async function markNoticesRead(ids) {
    try { await Api.post('/notifications/read', { ids }); } catch (e) { /* will show again next time */ }
    notices.forEach((n) => { if (ids.includes(n.id)) n.read = true; });
    renderNoticeList();
  }

  // Shows unread notices one at a time as a popup.
  function showNoticePopup(queue) {
    if (!queue.length) { popupShowing = false; return; }
    popupShowing = true;
    const n = queue[0];
    const left = queue.length - 1;
    modalRoot.dataset.locked = '';
    openModal(`
      <div class="notice-icon">&#128276;</div>
      <h3 class="rcpt-title">${esc(n.title)}</h3>
      <p class="rcpt-msg notice-text">${nl2br(n.message)}</p>
      <div class="modal-actions wrap">
        ${n.buttonText && n.buttonUrl ? `<a class="btn btn-accent" id="np-link" href="${esc(n.buttonUrl)}" ${noticeLink(n.buttonUrl).external ? 'target="_blank" rel="noopener"' : ''}>${esc(n.buttonText)}</a>` : ''}
        <button type="button" class="btn btn-primary" id="np-ok">${left ? `Next (${left} more)` : 'Got it'}</button>
      </div>`);
    const next = async () => { await markNoticesRead([n.id]); closeModal(); showNoticePopup(queue.slice(1)); };
    $('np-ok').addEventListener('click', next);
    $('np-link')?.addEventListener('click', () => { markNoticesRead([n.id]); });
  }

  async function loadNotices(listOnly) {
    try {
      const r = await Api.get('/notifications');
      notices = r.notifications;
      renderNoticeList();
      // Don't pop over something else the customer is in the middle of.
      if (!listOnly && !popupShowing && modalRoot.style.display === 'none') {
        const unread = notices.filter((n) => !n.read).reverse(); // oldest first
        if (unread.length) showNoticePopup(unread);
      }
    } catch (err) { /* not important enough to show an error */ }
  }

  // ---- Transactions ----
  const TX_TYPE_LABELS = {
    airtime: 'Airtime',
    data: 'Data',
    electricity: 'Electricity',
    cable: 'Cable TV',
    exam: 'Exam PIN',
    'wallet-funding': 'Wallet Funding',
    'transfer-out': 'Transfer Sent',
    'transfer-in': 'Transfer Received',
    withdrawal: 'Withdrawal',
    airtime2cash: 'Airtime to Cash',
    'admin-adjustment': 'Admin Adjustment'
  };
  const txTypeLabel = (type) => TX_TYPE_LABELS[type] || type;
  let txCache = [];

  function txRow(tx, withType) {
    const badgeClass = tx.status === 'success' ? 'badge-success' : tx.status === 'failed' ? 'badge-danger' : 'badge-neutral';
    const label = tx.status === 'pending' ? 'processing' : tx.status;
    return `<tr>
      <td>${esc(tx.description)}</td>
      ${withType ? `<td>${esc(txTypeLabel(tx.type))}</td>` : ''}
      <td>${formatNaira(tx.amount)}</td>
      <td><span class="badge ${badgeClass}">${esc(label)}</span></td>
      <td>${new Date(tx.createdAt).toLocaleString('en-NG')}</td>
      <td><button type="button" class="btn-link-secondary" data-receipt="${esc(tx.id)}">View</button></td>
    </tr>`;
  }

  function openTxReceipt(id) {
    const tx = txCache.find((t) => t.id === id);
    if (!tx) return;
    showReceipt({
      state: tx.status === 'success' ? 'success' : tx.status === 'failed' ? 'failed' : 'pending',
      title: tx.status === 'pending' ? 'Processing' : undefined,
      message: tx.status === 'failed' ? 'This transaction did not go through. Any amount debited was returned to your wallet.' : tx.status === 'pending' ? 'This order is still being processed. We will update it automatically.' : '',
      amount: tx.amount,
      rows: [['Type', txTypeLabel(tx.type)], ['Details', tx.description], ['Status', tx.status]],
      token: tx.meta?.token,
      cards: tx.meta?.cards,
      reference: tx.reference,
      date: new Date(tx.createdAt).toLocaleString('en-NG')
    });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-receipt]');
    if (b) openTxReceipt(b.dataset.receipt);
  });

  let pendingPolls = 0;
  function schedulePendingPoll() {
    if (pendingPolls >= 8) return;
    if (!txCache.some((t) => t.status === 'pending')) { pendingPolls = 0; return; }
    pendingPolls++;
    setTimeout(async () => { await loadHomeTransactions(); refreshUser(); }, 12000);
  }

  async function fetchTransactions() {
    const { transactions } = await Api.get('/transactions');
    txCache = transactions;
    return transactions;
  }

  async function loadHomeTransactions() {
    try {
      const transactions = await fetchTransactions();
      const recent = transactions.slice(0, 6);
      $('home-tx-body').innerHTML = recent.map((t) => txRow(t, false)).join('');
      $('home-tx-empty').style.display = recent.length ? 'none' : 'block';
      if ($('view-transactions').classList.contains('active')) renderFullTransactions();
      schedulePendingPoll();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderFullTransactions() {
    const type = $('tx-filter-type').value;
    const status = $('tx-filter-status').value;
    const list = txCache.filter((t) => {
      const typeOk = !type || t.type === type || (type === 'transfer' && t.type.startsWith('transfer'));
      return typeOk && (!status || t.status === status);
    });
    $('full-tx-body').innerHTML = list.map((t) => txRow(t, true)).join('');
    $('full-tx-empty').style.display = list.length ? 'none' : 'block';
  }

  async function loadFullTransactions() {
    try {
      await fetchTransactions();
      renderFullTransactions();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  $('tx-filter-type').addEventListener('change', renderFullTransactions);
  $('tx-filter-status').addEventListener('change', renderFullTransactions);

  // ---- Quick-amount chips (airtime + fund) ----
  function wireChips(containerId, inputId, after) {
    $(containerId).addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $(inputId).value = chip.dataset.amount;
      after?.();
    });
  }

  function updatePayHints() {
    const a = Number($('airtime-amount').value);
    $('airtime-pay-hint').textContent = a ? `You pay ${formatNaira(withMarkup(a, markups.airtime))}${markups.airtime ? ` (includes ${markups.airtime}% service fee)` : ''}.` : '';
    const e = Number($('elec-amount').value);
    $('elec-pay-hint').textContent = e ? `You pay ${formatNaira(withMarkup(e, markups.electricity))}${markups.electricity ? ` (includes ${markups.electricity}% service fee)` : ''}.` : '';
  }
  wireChips('airtime-chips', 'airtime-amount', updatePayHints);
  $('airtime-amount').addEventListener('input', updatePayHints);
  $('elec-amount').addEventListener('input', updatePayHints);
  wireChips('fund-chips', 'fund-amount');

  // ---- Airtime ----
  $('airtime-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const network = $('airtime-network').value;
    const phone = $('airtime-phone').value.trim();
    const amount = Number($('airtime-amount').value);
    confirmPurchase({
      title: `${network.toUpperCase()} Airtime`,
      rows: [['Network', network.toUpperCase()], ['Phone number', phone], ['Airtime value', formatNaira(amount)]],
      price: withMarkup(amount, markups.airtime),
      submit: (payWith) => Api.post('/services/airtime', { network, phone, amount, payWith }),
      onDone: () => { e.target.reset(); updatePayHints(); }
    });
  });

  // ---- Data: network -> plan type -> plan ----
  const dataNetworkEl = $('data-network');
  let dataPlans = [];
  let dataCategory = '';
  let selectedPlan = null;

  const titleCase = (t) => String(t).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  function renderDataPlans() {
    const list = dataPlans.filter((p) => p.category === dataCategory);
    $('data-plans').innerHTML = list.map((p) => `
      <button type="button" class="plan-item ${selectedPlan && selectedPlan.variation_code === p.variation_code ? 'selected' : ''}" data-code="${esc(p.variation_code)}">
        <span class="plan-main"><strong>${esc(p.size || p.name)}</strong><small>${esc(p.validity || '')}</small></span>
        <span class="plan-price">${formatNaira(p.price)}</span>
      </button>`).join('');
    $('data-plan-hint').textContent = list.length ? '' : 'No plans in this group right now.';
  }

  function renderDataCategories(categories) {
    $('data-categories').innerHTML = categories.map((c) =>
      `<button type="button" class="chip ${c.name === dataCategory ? 'active' : ''}" data-cat="${esc(c.name)}">${esc(titleCase(c.name))} <small>(${c.count})</small></button>`).join('');
  }

  dataNetworkEl.addEventListener('change', async () => {
    const network = dataNetworkEl.value;
    dataPlans = []; dataCategory = ''; selectedPlan = null;
    $('data-cat-field').style.display = 'none';
    $('data-plan-field').style.display = 'none';
    if (!network) return;
    try {
      const { plans, categories } = await Api.get(`/services/data/plans/${network}`);
      dataPlans = plans;
      if (!plans.length) {
        $('data-plan-field').style.display = 'block';
        $('data-plans').innerHTML = '';
        $('data-plan-hint').textContent = 'No data plans are available for this network right now.';
        return;
      }
      dataCategory = categories[0].name;
      renderDataCategories(categories);
      $('data-categories').dataset.cats = JSON.stringify(categories);
      $('data-cat-field').style.display = 'block';
      $('data-plan-field').style.display = 'block';
      renderDataPlans();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('data-categories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    dataCategory = b.dataset.cat;
    selectedPlan = null;
    renderDataCategories(JSON.parse($('data-categories').dataset.cats));
    renderDataPlans();
  });

  $('data-plans').addEventListener('click', (e) => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    selectedPlan = dataPlans.find((p) => p.variation_code === b.dataset.code) || null;
    renderDataPlans();
  });

  $('data-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const network = dataNetworkEl.value;
    const phone = $('data-phone').value.trim();
    if (!selectedPlan) return toast('Please choose a data plan.', 'error');
    const plan = selectedPlan;
    confirmPurchase({
      title: `${network.toUpperCase()} Data`,
      rows: [['Network', network.toUpperCase()], ['Plan type', titleCase(plan.category)], ['Plan', plan.name], ['Phone number', phone]],
      price: Number(plan.price),
      submit: (payWith) => Api.post('/services/data', { network, phone, variation_code: plan.variation_code, payWith }),
      onDone: () => {
        e.target.reset();
        dataPlans = []; selectedPlan = null; dataCategory = '';
        $('data-cat-field').style.display = 'none';
        $('data-plan-field').style.display = 'none';
      }
    });
  });

  // ---- Customer verification helper (meter / smartcard) ----
  function makeVerifier({ btnId, boxId, keyFields, request, label }) {
    let verifiedKey = '';
    let customer = '';
    const box = $(boxId);
    const keyNow = () => keyFields.map((id) => $(id).value.trim()).join('|');

    keyFields.forEach((id) => $(id).addEventListener('input', () => {
      if (verifiedKey && verifiedKey !== keyNow()) {
        verifiedKey = ''; customer = '';
        box.style.display = 'none';
      }
    }));

    $(btnId).addEventListener('click', async () => {
      box.style.display = 'none';
      try {
        const r = await request();
        verifiedKey = keyNow();
        customer = r.customerName || '';
        box.className = 'verify-box ok';
        box.innerHTML = `<strong>${esc(customer || 'Verified')}</strong><span>${esc(label)} verified</span>`;
        box.style.display = 'block';
      } catch (err) {
        verifiedKey = '';
        box.className = 'verify-box bad';
        box.innerHTML = `<strong>${esc(err.message)}</strong>`;
        box.style.display = 'block';
      }
    });

    return { ok: () => !!verifiedKey && verifiedKey === keyNow(), name: () => customer };
  }

  // ---- Electricity ----
  async function loadDiscos() {
    try {
      const { discos } = await Api.get('/services/electricity/discos');
      $('elec-disco').innerHTML = discos.length
        ? `<option value="">Select distribution company</option>${discos.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}`
        : '<option value="">Not available right now</option>';
    } catch (err) {
      $('elec-disco').innerHTML = '<option value="">Not available right now</option>';
    }
  }

  const elecVerify = makeVerifier({
    btnId: 'elec-verify-btn',
    boxId: 'elec-verify-box',
    keyFields: ['elec-disco', 'elec-meter-type', 'elec-meter'],
    label: 'Meter',
    request: () => Api.post('/services/verify', {
      kind: 'electricity',
      disco: $('elec-disco').value,
      meterType: $('elec-meter-type').value,
      meter: $('elec-meter').value.trim()
    })
  });

  $('electricity-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!elecVerify.ok()) return toast('Please verify the meter number first.', 'error');
    const discoEl = $('elec-disco');
    const disco = discoEl.value;
    const meterType = $('elec-meter-type').value;
    const meter = $('elec-meter').value.trim();
    const phone = $('elec-phone').value.trim();
    const amount = Number($('elec-amount').value);
    confirmPurchase({
      title: 'Electricity bill',
      rows: [['Disco', discoEl.selectedOptions[0].textContent], ['Meter type', meterType], ['Meter number', meter], ['Customer', elecVerify.name()], ['Phone number', phone], ['Units value', formatNaira(amount)]],
      price: withMarkup(amount, markups.electricity),
      submit: (payWith) => Api.post('/services/electricity', { disco, meterType, meter, phone, amount, customerName: elecVerify.name(), payWith }),
      onDone: () => { e.target.reset(); $('elec-verify-box').style.display = 'none'; updatePayHints(); }
    });
  });

  // ---- Cable ----
  const cableProviderEl = $('cable-provider');
  const cablePlanEl = $('cable-plan');
  cableProviderEl.addEventListener('change', async () => {
    const provider = cableProviderEl.value;
    if (!provider) return;
    cablePlanEl.disabled = true;
    cablePlanEl.innerHTML = '<option>Loading bouquets...</option>';
    try {
      const { plans } = await Api.get(`/services/cable/plans/${provider}`);
      cablePlanEl.innerHTML = plans.length
        ? plans.map((p) => `<option value="${esc(p.variation_code)}" data-price="${p.price}" data-name="${esc(p.name)}">${esc(p.name)} — ${formatNaira(p.price)}</option>`).join('')
        : '<option value="">No bouquets available right now</option>';
      cablePlanEl.disabled = !plans.length;
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const cableVerify = makeVerifier({
    btnId: 'cable-verify-btn',
    boxId: 'cable-verify-box',
    keyFields: ['cable-provider', 'cable-card'],
    label: 'Smartcard',
    request: () => Api.post('/services/verify', {
      kind: 'cable',
      provider: cableProviderEl.value,
      smartcardNumber: $('cable-card').value.trim()
    })
  });

  $('cable-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!cableVerify.ok()) return toast('Please verify the smartcard number first.', 'error');
    const provider = cableProviderEl.value;
    const selected = cablePlanEl.selectedOptions[0];
    const variation_code = cablePlanEl.value;
    const smartcardNumber = $('cable-card').value.trim();
    const phone = $('cable-phone').value.trim();
    if (!variation_code) return toast('Please choose a bouquet.', 'error');
    confirmPurchase({
      title: `${provider.toUpperCase()} subscription`,
      rows: [['Provider', provider.toUpperCase()], ['Bouquet', selected.dataset.name], ['Smartcard / IUC', smartcardNumber], ['Customer', cableVerify.name()], ['Phone number', phone]],
      price: Number(selected.dataset.price),
      submit: (payWith) => Api.post('/services/cable', { provider, smartcardNumber, variation_code, phone, customerName: cableVerify.name(), payWith }),
      onDone: () => {
        e.target.reset();
        $('cable-verify-box').style.display = 'none';
        cablePlanEl.innerHTML = '<option value="">Select a provider first</option>';
        cablePlanEl.disabled = true;
      }
    });
  });

  // ---- Exam PINs ----
  const examPlanEl = $('exam-plan');
  async function loadExamPlans() {
    try {
      const { plans } = await Api.get('/services/exam/plans');
      examPlanEl.innerHTML = plans.length
        ? plans.map((p) => `<option value="${esc(p.variation_code)}" data-price="${p.price}" data-body="${esc(p.serviceID || '')}" data-name="${esc(p.name)}" data-profile="${p.needsProfile ? '1' : ''}">${esc(p.name)} — ${formatNaira(p.price)}</option>`).join('')
        : '<option value="">No PINs available right now</option>';
      toggleExamProfile();
      if (!plans.length) {
        const sub = $('exam-tile-sub');
        if (sub) sub.textContent = 'Coming soon';
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  function toggleExamProfile() {
    const needs = examPlanEl.selectedOptions[0]?.dataset.profile === '1';
    $('exam-profile-field').style.display = needs ? 'block' : 'none';
    $('exam-profile').required = needs;
  }
  examPlanEl.addEventListener('change', toggleExamProfile);

  $('exam-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const selected = examPlanEl.selectedOptions[0];
    const variation_code = examPlanEl.value;
    if (!variation_code) return toast('Please choose a PIN type.', 'error');
    const examBody = selected.dataset.body;
    const quantity = Math.min(Math.max(parseInt($('exam-quantity').value, 10) || 1, 1), 5);
    const phone = $('exam-phone').value.trim();
    const profileId = selected.dataset.profile === '1' ? $('exam-profile').value.trim() : undefined;
    confirmPurchase({
      title: 'Exam PIN',
      rows: [['PIN type', selected.dataset.name], ['Quantity', quantity], ['JAMB profile', profileId], ['Phone number', phone]],
      price: Number(selected.dataset.price) * quantity,
      submit: (payWith) => Api.post('/services/exam', { examBody, variation_code, quantity, phone, profileId, payWith }),
      onDone: () => { e.target.reset(); toggleExamProfile(); }
    });
  });

  // ---- Fund wallet (Flutterwave) ----
  $('fund-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const amount = $('fund-amount').value;
      const init = await Api.post('/wallet/fund/initialize', { amount });

      if (init.mock) {
        const verify = await Api.post('/wallet/fund/verify', { reference: init.reference });
        setUser(verify.user);
        toast('Wallet funded successfully.');
        e.target.reset();
        loadHomeTransactions();
      } else if (init.authorization_url) {
        // Send the customer to Flutterwave's secure checkout. They come back to
        // dashboard.html?tx_ref=...&status=..., handled by checkPendingFunding().
        localStorage.setItem('pending_funding_ref', init.reference);
        location.href = init.authorization_url;
        return;
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function verifyFundingWithRetry(ref, attempt = 0) {
    try {
      const verify = await Api.post('/wallet/fund/verify', { reference: ref });
      setUser(verify.user);
      if (verify.state === 'pending') {
        if (attempt < 6) return setTimeout(() => verifyFundingWithRetry(ref, attempt + 1), 5000);
        toast(verify.message);
        return;
      }
      localStorage.removeItem('pending_funding_ref');
      if (verify.order) {
        receiptFromOrder(verify.order);
      } else {
        toast(verify.message || 'Wallet funded successfully.');
      }
      loadHomeTransactions();
    } catch (err) {
      localStorage.removeItem('pending_funding_ref');
      toast(err.message || 'We could not confirm that payment. If you were charged, contact support.', 'error');
    }
  }

  async function checkPendingFunding() {
    const params = new URLSearchParams(location.search);
    const ref = params.get('tx_ref') || localStorage.getItem('pending_funding_ref');
    const status = params.get('status');
    if (params.has('tx_ref') || params.has('status') || params.has('fund')) {
      history.replaceState({}, '', location.pathname); // tidy the URL
    }
    if (!ref) return;
    if (status === 'cancelled') {
      localStorage.removeItem('pending_funding_ref');
      toast('Payment cancelled. You have not been charged.', 'error');
      return;
    }
    showView('home');
    verifyFundingWithRetry(ref);
  }

  // ---- Live limits (min withdrawal, airtime2cash rate) ----
  async function loadLimits() {
    try {
      const limits = await Api.get('/services/limits');
      const { airtimeToCashRatePercent, minWithdrawal } = limits;
      markups.airtime = Number(limits.airtimeMarkupPercent || 0);
      markups.electricity = Number(limits.electricityMarkupPercent || 0);
      updatePayHints();
      document.getElementById('a2c-rate-hint').textContent =
        `You'll receive ${airtimeToCashRatePercent}% of face value, subject to verification.`;
      document.getElementById('withdraw-min-hint').textContent =
        `Minimum withdrawal is ${formatNaira(minWithdrawal)}.`;
    } catch (err) {
      /* non-critical — hints stay generic if this fails */
    }
  }

  // ---- Bank list & account resolution (for Settings > bank account) ----
  const bankSelect = document.getElementById('bank-select');
  let banksLoaded = false;

  async function loadBanks() {
    if (banksLoaded) return;
    try {
      const { banks } = await Api.get('/security/banks');
      bankSelect.innerHTML = banks
        .map((b) => `<option value="${b.code}">${b.name}</option>`)
        .join('');
      banksLoaded = true;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('resolve-account-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const accountNumber = document.getElementById('bank-account-number').value.trim();
    const bankCode = bankSelect.value;
    if (!accountNumber || !bankCode) {
      return toast('Select a bank and enter the account number first.', 'error');
    }
    try {
      const { accountName } = await Api.post('/security/resolve-account', { accountNumber, bankCode });
      document.getElementById('bank-account-name').value = accountName;
      toast('Account name verified.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---- Airtime to cash: method hint ----
  const a2cMethodSelect = document.getElementById('a2c-method');
  function updateA2cMethodHint() {
    const hint = document.getElementById('a2c-method-hint');
    hint.textContent =
      a2cMethodSelect.value === 'automatic'
        ? 'Verified instantly where a provider is configured — otherwise queued for manual review.'
        : 'An admin verifies your airtime was received before crediting your wallet.';
  }
  a2cMethodSelect.addEventListener('change', updateA2cMethodHint);
  updateA2cMethodHint();

  // ---- Transfer ----
  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const recipient = document.getElementById('transfer-recipient').value.trim();
      const amount = document.getElementById('transfer-amount').value;
      const pin = document.getElementById('transfer-pin').value;
      const data = await Api.post('/transfer', { recipient, amount, pin });
      setUser(data.user);
      toast(data.message || 'Transfer successful.');
      e.target.reset();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Withdraw ----
  async function loadWithdrawInfo() {
    try {
      const { hasBankAccount } = await Api.get('/security/status');
      document.getElementById('withdraw-no-bank').style.display = hasBankAccount ? 'none' : 'block';
      document.getElementById('withdraw-bank-summary').style.display = hasBankAccount ? 'block' : 'none';
      document.getElementById('withdraw-form').style.display = hasBankAccount ? 'block' : 'none';
      if (hasBankAccount && user.bankAccount) {
        document.getElementById('withdraw-bank-details').textContent =
          `${user.bankAccount.bankName} — ${user.bankAccount.accountNumber} (${user.bankAccount.accountName})`;
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('withdraw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const amount = document.getElementById('withdraw-amount').value;
      const pin = document.getElementById('withdraw-pin').value;
      const data = await Api.post('/withdrawal', { amount, pin });
      setUser(data.user);
      toast(data.message || 'Withdrawal requested.');
      e.target.reset();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Airtime to Cash ----
  document.getElementById('airtime2cash-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const method = document.getElementById('a2c-method').value;
      const network = document.getElementById('a2c-network').value;
      const amountSent = document.getElementById('a2c-amount').value;
      const phoneUsed = document.getElementById('a2c-phone').value.trim();
      const pin = document.getElementById('a2c-pin').value;
      const data = await Api.post('/airtime-to-cash', { network, amountSent, phoneUsed, pin, method });
      toast(data.message || 'Request submitted.');
      e.target.reset();
      updateA2cMethodHint();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Settings: PIN ----
  async function loadSecurityStatus() {
    try {
      const { hasPin } = await Api.get('/security/status');
      document.getElementById('pin-current-field').style.display = hasPin ? 'block' : 'none';
      document.getElementById('pin-current').required = hasPin;
      document.getElementById('pin-submit-btn').textContent = hasPin ? 'Change PIN' : 'Set PIN';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const currentPin = document.getElementById('pin-current').value || undefined;
      const newPin = document.getElementById('pin-new').value;
      const password = document.getElementById('pin-password').value;
      const data = await Api.post('/security/pin', { currentPin, newPin, password });
      setUser(data.user);
      toast(data.message || 'PIN saved.');
      e.target.reset();
      loadSecurityStatus();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Settings: bank account ----
  document.getElementById('bank-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const bankCode = bankSelect.value;
      const bankName = bankSelect.selectedOptions[0]?.textContent || '';
      const accountNumber = document.getElementById('bank-account-number').value.trim();
      const accountName = document.getElementById('bank-account-name').value.trim();
      const pin = document.getElementById('bank-pin').value;
      if (!bankCode) throw new Error('Please select a bank.');
      const data = await Api.put('/security/bank-account', { bankName, bankCode, accountNumber, accountName, pin });
      setUser(data.user);
      toast(data.message || 'Bank account saved.');
      document.getElementById('bank-pin').value = '';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Init ----
  renderUser();
  refreshUser().then(loadProviderStrip);
  loadStatus();
  loadNotices(false);
  setInterval(() => { if (!document.hidden) loadNotices(false); }, 120000);
  setInterval(() => { if (!document.hidden) loadStatus(); }, 60000);
  loadDiscos();
  loadHomeTransactions();
  loadExamPlans();
  loadLimits();
  checkPendingFunding();
})();
