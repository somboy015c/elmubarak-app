(function () {
  if (!Api.isLoggedIn()) {
    location.href = 'login.html';
    return;
  }
  let user = Api.currentUser();
  if (!user?.isAdmin) {
    toast('This page is for admins only.', 'error');
    setTimeout(() => (location.href = 'dashboard.html'), 1200);
    return;
  }

  function renderUser() {
    const initial = (user.fullName || 'U').trim().charAt(0).toUpperCase();
    document.getElementById('sidebar-avatar').textContent = initial;
    document.getElementById('sidebar-username').textContent = user.fullName || 'there';
    document.getElementById('sidebar-balance').textContent = formatNaira(user.walletBalance);
    document.getElementById('topbar-avatar').textContent = initial;
    document.getElementById('topbar-username').textContent = user.fullName || 'there';
    document.getElementById('topbar-balance').textContent = formatNaira(user.walletBalance);
  }

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

  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${name}`)?.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    if (name === 'withdrawals') loadWithdrawals();
    if (name === 'airtime2cash') loadAirtimeToCash();
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

  async function loadOverview() {
    try {
      const stats = await Api.get('/admin/stats');
      document.getElementById('stat-users').textContent = stats.totalUsers;
      document.getElementById('stat-tx').textContent = stats.totalTransactions;
      document.getElementById('stat-revenue').textContent = formatNaira(stats.totalRevenue);
      document.getElementById('stat-float').textContent = formatNaira(stats.totalWalletFloat);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadProviderBalance() {
    const card = document.getElementById('provider-card');
    const status = document.getElementById('vtpass-status');
    status.textContent = 'Checking...';
    try {
      const r = await Api.get('/admin/provider-balance');
      document.getElementById('vtpass-balance').textContent = formatNaira(r.balance);
      document.getElementById('vtpass-open').href = r.dashboardUrl;
      document.getElementById('vtpass-mode').textContent = r.mock ? 'mock data' : r.dashboardUrl.includes('sandbox') ? 'sandbox' : 'live';
      card.classList.toggle('low', !!r.low);
      status.textContent = (r.low
        ? `Low balance (below ${formatNaira(r.threshold)}). Top up your provider wallet or customer orders will start failing. `
        : 'Funds available for customer orders. ') + `Updated ${new Date(r.checkedAt).toLocaleTimeString('en-NG')}.`;
    } catch (err) {
      document.getElementById('vtpass-balance').textContent = '—';
      status.textContent = err.message;
    }
  }
  document.getElementById('vtpass-refresh').addEventListener('click', loadProviderBalance);
  document.getElementById('provider-check-btn').addEventListener('click', async () => {
    const out = document.getElementById('provider-check-out');
    out.style.display = 'block';
    out.textContent = 'Checking provider...';
    try {
      out.textContent = JSON.stringify(await Api.get('/admin/provider-check'), null, 2);
    } catch (err) {
      out.textContent = err.message;
    }
  });
  setInterval(() => { if (!document.hidden) loadProviderBalance(); }, 120000);

  async function loadUsers() {
    try {
      const { users } = await Api.get('/admin/users');
      document.getElementById('users-body').innerHTML = users
        .map(
          (u) => `<tr>
            <td>${u.fullName}${u.isAdmin ? ' <span class="badge badge-neutral">admin</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${u.phone}</td>
            <td>${formatNaira(u.walletBalance)}</td>
            <td>
              <button class="btn btn-ghost btn-sm adjust-btn" data-id="${u.id}" data-name="${u.fullName}">Adjust</button>
            </td>
          </tr>`
        )
        .join('');

      document.querySelectorAll('.adjust-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const amountStr = prompt(`Adjust wallet for ${btn.dataset.name}.\nEnter an amount (use a negative number to debit):`);
          if (amountStr === null || amountStr.trim() === '') return;
          const amount = Number(amountStr);
          if (!amount) return toast('Enter a valid, non-zero amount.', 'error');
          const reason = prompt('Reason for this adjustment (optional):') || undefined;
          try {
            await Api.post(`/admin/users/${btn.dataset.id}/wallet-adjust`, { amount, reason });
            toast('Wallet updated.');
            loadUsers();
            loadOverview();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadTransactions() {
    try {
      const { transactions } = await Api.get('/admin/transactions');
      document.getElementById('admin-tx-body').innerHTML = transactions
        .map((t) => {
          const badgeClass = t.status === 'success' ? 'badge-success' : t.status === 'failed' ? 'badge-danger' : 'badge-neutral';
          return `<tr>
            <td>${t.description}</td>
            <td style="text-transform:capitalize">${t.type}</td>
            <td>${formatNaira(t.amount)}</td>
            <td><span class="badge ${badgeClass}">${t.status}</span></td>
            <td>${new Date(t.createdAt).toLocaleString('en-NG')}</td>
            <td>${t.status === 'pending' && ['airtime', 'data', 'electricity', 'cable', 'exam'].includes(t.type)
              ? `<button class="btn btn-primary btn-sm tx-resolve" data-id="${t.id}" data-action="success">Mark paid</button> <button class="btn btn-danger btn-sm tx-resolve" data-id="${t.id}" data-action="refund">Refund</button>`
              : ''}</td>
          </tr>`;
        })
        .join('');

      document.querySelectorAll('.tx-resolve').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const refund = btn.dataset.action === 'refund';
          if (!confirm(refund ? 'Refund the customer and mark this order failed?' : 'Mark this order as successfully delivered?')) return;
          try {
            const r = await Api.post(`/admin/transactions/${btn.dataset.id}/resolve`, { action: btn.dataset.action });
            toast(r.message);
            loadTransactions();
            loadOverview();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadPricing() {
    try {
      const { pricing } = await Api.get('/admin/pricing');
      document.getElementById('markup-data').value = pricing.data.markupPercent;
      document.getElementById('markup-electricity').value = pricing.electricity.markupPercent;
      document.getElementById('markup-cable').value = pricing.cable.markupPercent;
      document.getElementById('exam-fee').value = pricing.exam.flatFee;
      document.getElementById('a2c-rate').value = pricing.airtimeToCash.ratePercent;
      document.getElementById('min-withdrawal').value = pricing.withdrawal.minAmount;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('pricing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        data: { markupPercent: Number(document.getElementById('markup-data').value) },
        electricity: { markupPercent: Number(document.getElementById('markup-electricity').value) },
        cable: { markupPercent: Number(document.getElementById('markup-cable').value) },
        exam: { flatFee: Number(document.getElementById('exam-fee').value) },
        airtime: { markupPercent: 0 },
        airtimeToCash: { ratePercent: Number(document.getElementById('a2c-rate').value) },
        withdrawal: { minAmount: Number(document.getElementById('min-withdrawal').value) }
      };
      await Api.put('/admin/pricing', payload);
      toast('Pricing updated.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---- Withdrawals ----
  async function loadWithdrawals() {
    try {
      const { withdrawals } = await Api.get('/admin/withdrawals');
      document.getElementById('withdrawals-empty').style.display = withdrawals.length ? 'none' : 'block';
      document.getElementById('withdrawals-body').innerHTML = withdrawals
        .map((w) => {
          const badgeClass = w.status === 'success' ? 'badge-success' : w.status === 'failed' ? 'badge-danger' : 'badge-neutral';
          const actions =
            w.status === 'pending'
              ? `<button class="btn btn-accent btn-sm approve-wd-btn" data-id="${w.id}">Mark paid</button>
                 <button class="btn btn-danger btn-sm reject-wd-btn" data-id="${w.id}">Reject</button>`
              : (w.adminNote || '—');
          return `<tr>
            <td>${w.userName}<br><span style="color:var(--text-muted);font-size:0.8rem;">${w.userEmail}</span></td>
            <td>${formatNaira(w.amount)}</td>
            <td>${w.bankName} — ${w.accountNumber}<br><span style="color:var(--text-muted);font-size:0.8rem;">${w.accountName}</span></td>
            <td><span class="badge ${badgeClass}">${w.status}</span></td>
            <td>${new Date(w.createdAt).toLocaleString('en-NG')}</td>
            <td>${actions}</td>
          </tr>`;
        })
        .join('');

      document.querySelectorAll('.approve-wd-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Confirm you have sent this payout to the user\'s bank account?')) return;
          try {
            await Api.post(`/admin/withdrawals/${btn.dataset.id}/approve`, {});
            toast('Marked as paid.');
            loadWithdrawals();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
      document.querySelectorAll('.reject-wd-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const note = prompt('Reason for rejecting (the wallet will be refunded):') || undefined;
          try {
            await Api.post(`/admin/withdrawals/${btn.dataset.id}/reject`, { note });
            toast('Withdrawal rejected and refunded.');
            loadWithdrawals();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---- Airtime to Cash ----
  async function loadAirtimeToCash() {
    try {
      const { requests } = await Api.get('/admin/airtime-to-cash');
      document.getElementById('a2c-empty').style.display = requests.length ? 'none' : 'block';
      document.getElementById('a2c-body').innerHTML = requests
        .map((r) => {
          const badgeClass = r.status === 'success' ? 'badge-success' : r.status === 'failed' ? 'badge-danger' : 'badge-neutral';
          const actions =
            r.status === 'pending'
              ? `<button class="btn btn-accent btn-sm approve-a2c-btn" data-id="${r.id}">Verify & credit</button>
                 <button class="btn btn-danger btn-sm reject-a2c-btn" data-id="${r.id}">Reject</button>`
              : (r.adminNote || '—');
          return `<tr>
            <td>${r.userName}<br><span style="color:var(--text-muted);font-size:0.8rem;">${r.userEmail}</span></td>
            <td style="text-transform:uppercase">${r.network}</td>
            <td>${formatNaira(r.amountSent)}</td>
            <td>${formatNaira(r.cashValue)}</td>
            <td>${r.phoneUsed}</td>
            <td style="text-transform:capitalize">${r.method}</td>
            <td><span class="badge ${badgeClass}">${r.status}</span></td>
            <td>${actions}</td>
          </tr>`;
        })
        .join('');

      document.querySelectorAll('.approve-a2c-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Confirm you received this airtime before crediting the wallet?')) return;
          try {
            await Api.post(`/admin/airtime-to-cash/${btn.dataset.id}/approve`, {});
            toast('Verified and credited.');
            loadAirtimeToCash();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
      document.querySelectorAll('.reject-a2c-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const note = prompt('Reason for rejecting:') || undefined;
          try {
            await Api.post(`/admin/airtime-to-cash/${btn.dataset.id}/reject`, { note });
            toast('Request rejected.');
            loadAirtimeToCash();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  renderUser();
  refreshUser();
  loadOverview();
  loadProviderBalance();
  loadUsers();
  loadTransactions();
  loadPricing();
})();
