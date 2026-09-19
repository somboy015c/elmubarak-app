(function () {
  if (!Api.isLoggedIn()) {
    location.href = 'login.html';
    return;
  }

  let user = Api.currentUser();

  // ---- View switching ----
  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    if (name === 'transactions') loadFullTransactions();
    if (name === 'settings') { loadSecurityStatus(); loadBanks(); }
    if (name === 'withdraw') loadWithdrawInfo();
    closeSidebar();
  }

  document.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      showView(el.dataset.view);
    });
  });

  // ---- Mobile off-canvas drawer ----
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggle = document.getElementById('sidebar-toggle');

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

  document.getElementById('logout-btn').addEventListener('click', () => {
    showLoader();
    Api.clearSession();
    location.href = 'login.html';
  });

  // ---- Header / wallet ----
  function renderUser() {
    const firstName = user.fullName?.split(' ')[0] || 'there';
    const initial = (user.fullName || 'U').trim().charAt(0).toUpperCase();

    document.getElementById('admin-link').style.display = user.isAdmin ? 'flex' : 'none';

    document.getElementById('sidebar-avatar').textContent = initial;
    document.getElementById('sidebar-username').textContent = user.fullName || 'there';
    document.getElementById('sidebar-balance').textContent = formatNaira(user.walletBalance);

    document.getElementById('topbar-avatar').textContent = initial;
    document.getElementById('topbar-username').textContent = user.fullName || 'there';
    document.getElementById('topbar-balance').textContent = formatNaira(user.walletBalance);

    document.getElementById('mobile-profile-avatar').textContent = initial;
    document.getElementById('mobile-profile-name').textContent = user.fullName || 'there';
    document.getElementById('mobile-profile-balance').textContent = formatNaira(user.walletBalance);
  }

  document.getElementById('mobile-fund-btn').addEventListener('click', () => showView('fund'));

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
  function txTypeLabel(type) {
    return TX_TYPE_LABELS[type] || type;
  }

  function txRow(tx, withType) {
    const badgeClass = tx.status === 'success' ? 'badge-success' : tx.status === 'failed' ? 'badge-danger' : 'badge-neutral';
    return `<tr>
      <td>${tx.description}</td>
      ${withType ? `<td>${txTypeLabel(tx.type)}</td>` : ''}
      <td>${formatNaira(tx.amount)}</td>
      <td><span class="badge ${badgeClass}">${tx.status}</span></td>
      <td>${new Date(tx.createdAt).toLocaleString('en-NG')}</td>
    </tr>`;
  }

  async function loadHomeTransactions() {
    try {
      const { transactions } = await Api.get('/transactions');
      const recent = transactions.slice(0, 6);
      document.getElementById('home-tx-body').innerHTML = recent.map((t) => txRow(t, false)).join('');
      document.getElementById('home-tx-empty').style.display = recent.length ? 'none' : 'block';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadFullTransactions() {
    try {
      const { transactions } = await Api.get('/transactions');
      document.getElementById('full-tx-body').innerHTML = transactions.map((t) => txRow(t, true)).join('');
      document.getElementById('full-tx-empty').style.display = transactions.length ? 'none' : 'block';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---- Airtime ----
  document.getElementById('airtime-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const network = document.getElementById('airtime-network').value;
      const phone = document.getElementById('airtime-phone').value.trim();
      const amount = document.getElementById('airtime-amount').value;
      const data = await Api.post('/services/airtime', { network, phone, amount });
      user = data.user;
      renderUser();
      toast(data.message || 'Airtime purchased successfully.');
      e.target.reset();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Data ----
  const dataNetworkEl = document.getElementById('data-network');
  const dataPlanEl = document.getElementById('data-plan');
  dataNetworkEl.addEventListener('change', async () => {
    const network = dataNetworkEl.value;
    if (!network) return;
    dataPlanEl.disabled = true;
    dataPlanEl.innerHTML = '<option>Loading plans...</option>';
    try {
      const { plans } = await Api.get(`/services/data/plans/${network}`);
      dataPlanEl.innerHTML = plans
        .map((p) => `<option value="${p.variation_code}" data-price="${p.price}">${p.name} — ${formatNaira(p.price)}</option>`)
        .join('');
      dataPlanEl.disabled = false;
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('data-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const network = dataNetworkEl.value;
      const selected = dataPlanEl.selectedOptions[0];
      const variation_code = dataPlanEl.value;
      const amount = selected?.dataset.price;
      const phone = document.getElementById('data-phone').value.trim();
      if (!variation_code || !amount) throw new Error('Please choose a data plan.');
      const data = await Api.post('/services/data', { network, phone, variation_code, amount });
      user = data.user;
      renderUser();
      toast(data.message || 'Data purchased successfully.');
      e.target.reset();
      dataPlanEl.innerHTML = '<option value="">Select a network first</option>';
      dataPlanEl.disabled = true;
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Electricity ----
  document.getElementById('electricity-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const disco = document.getElementById('elec-disco').value;
      const meterType = document.getElementById('elec-meter-type').value;
      const meter = document.getElementById('elec-meter').value.trim();
      const phone = document.getElementById('elec-phone').value.trim();
      const amount = document.getElementById('elec-amount').value;
      const data = await Api.post('/services/electricity', { disco, meterType, meter, phone, amount });
      user = data.user;
      renderUser();
      toast(data.message || 'Electricity bill paid successfully.');
      e.target.reset();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Cable ----
  const cableProviderEl = document.getElementById('cable-provider');
  const cablePlanEl = document.getElementById('cable-plan');
  cableProviderEl.addEventListener('change', async () => {
    const provider = cableProviderEl.value;
    if (!provider) return;
    cablePlanEl.disabled = true;
    cablePlanEl.innerHTML = '<option>Loading bouquets...</option>';
    try {
      const { plans } = await Api.get(`/services/cable/plans/${provider}`);
      cablePlanEl.innerHTML = plans
        .map((p) => `<option value="${p.variation_code}" data-price="${p.price}">${p.name} — ${formatNaira(p.price)}</option>`)
        .join('');
      cablePlanEl.disabled = false;
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('cable-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const provider = cableProviderEl.value;
      const selected = cablePlanEl.selectedOptions[0];
      const variation_code = cablePlanEl.value;
      const amount = selected?.dataset.price;
      const smartcardNumber = document.getElementById('cable-card').value.trim();
      const phone = document.getElementById('cable-phone').value.trim();
      if (!variation_code || !amount) throw new Error('Please choose a bouquet.');
      const data = await Api.post('/services/cable', { provider, smartcardNumber, variation_code, phone, amount });
      user = data.user;
      renderUser();
      toast(data.message || 'Cable subscription successful.');
      e.target.reset();
      cablePlanEl.innerHTML = '<option value="">Select a provider first</option>';
      cablePlanEl.disabled = true;
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Exam PINs ----
  const examPlanEl = document.getElementById('exam-plan');
  async function loadExamPlans() {
    try {
      const { plans } = await Api.get('/services/exam/plans');
      examPlanEl.innerHTML = plans
        .map((p) => `<option value="${p.variation_code}" data-price="${p.price}" data-body="${p.variation_code.split('-')[0]}">${p.name} — ${formatNaira(p.price)}</option>`)
        .join('');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('exam-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const selected = examPlanEl.selectedOptions[0];
      const variation_code = examPlanEl.value;
      const amount = selected?.dataset.price;
      const examBody = selected?.dataset.body;
      const quantity = document.getElementById('exam-quantity').value;
      const phone = document.getElementById('exam-phone').value.trim();
      const data = await Api.post('/services/exam', { examBody, variation_code, amount, quantity, phone });
      user = data.user;
      renderUser();
      toast(data.message || 'Exam PIN purchased successfully.');
      e.target.reset();
      loadHomeTransactions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Fund wallet ----
  document.getElementById('fund-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const amount = document.getElementById('fund-amount').value;
      const init = await Api.post('/wallet/fund/initialize', { amount });

      if (init.mock) {
        const verify = await Api.post('/wallet/fund/verify', { reference: init.reference });
        user = verify.user;
        renderUser();
        toast('Wallet funded successfully.');
        e.target.reset();
      } else if (init.authorization_url) {
        // Real Paystack flow: send the user to the hosted checkout page.
        // Store the reference so we can verify it if they return to this tab.
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

  async function checkPendingFunding() {
    const ref = localStorage.getItem('pending_funding_ref');
    if (!ref) return;
    localStorage.removeItem('pending_funding_ref');
    try {
      const verify = await Api.post('/wallet/fund/verify', { reference: ref });
      user = verify.user;
      renderUser();
      toast('Wallet funded successfully.');
    } catch (err) {
      toast('We could not confirm that payment. If you were charged, contact support.', 'error');
    }
  }

  // ---- Live limits (min withdrawal, airtime2cash rate) ----
  async function loadLimits() {
    try {
      const { airtimeToCashRatePercent, minWithdrawal } = await Api.get('/services/limits');
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
      user = data.user;
      renderUser();
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
      user = data.user;
      renderUser();
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
      user = data.user;
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
      user = data.user;
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
  refreshUser();
  loadHomeTransactions();
  loadExamPlans();
  loadLimits();
  checkPendingFunding();
})();
