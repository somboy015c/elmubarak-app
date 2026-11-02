// The 6-digit email code window used at sign-up (and when logging in to an unverified account).
// OtpUI.mount(container, { email, autoSend, cooldown, onChangeEmail })
// On success it signs the customer in and sends them to the dashboard, all in the same window.
(function () {
  const MAIL = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  const CODE_LIFE = 10 * 60; // seconds, matches the server

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function mask(email) {
    const [name, domain] = String(email).split('@');
    if (!domain) return email;
    const shown = name.length <= 2 ? name[0] : name.slice(0, 2);
    return `${shown}${'•'.repeat(Math.max(2, name.length - shown.length))}@${domain}`;
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function mount(root, opts) {
    const email = opts.email;
    root.innerHTML = `
      <div class="otp-card">
        <div class="otp-icon" id="otp-icon">${MAIL}</div>
        <h2 id="otp-title">Verify your email</h2>
        <p class="otp-sub" id="otp-sub">We sent a 6-digit code to<br><strong>${esc(mask(email))}</strong></p>
        <div class="otp-row" id="otp-row">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<input class="otp-box" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}" data-i="${i}" />`).join('')}
        </div>
        <div class="otp-error" id="otp-error" role="alert"></div>
        <button type="button" class="btn btn-primary btn-block" id="otp-verify" disabled>Verify and continue</button>
        <div class="otp-meta" id="otp-meta">Code expires in <strong id="otp-exp">10:00</strong></div>
        <div class="otp-foot">
          Didn't get it? <button type="button" class="otp-link" id="otp-resend">Resend code</button>
          <span class="otp-dot">·</span>
          <button type="button" class="otp-link" id="otp-change">Wrong email?</button>
        </div>
        <p class="otp-hint">Check your spam folder if it doesn't arrive within a minute.</p>
      </div>`;

    const $ = (id) => root.querySelector('#' + id);
    const boxes = [...root.querySelectorAll('.otp-box')];
    let busy = false;
    let cool = 0;
    let coolTimer = null;
    let left = CODE_LIFE;
    let expTimer = null;

    const value = () => boxes.map((b) => b.value).join('');
    const refreshButton = () => { $('otp-verify').disabled = busy || value().length !== 6; };
    const clearBoxes = () => { boxes.forEach((b) => { b.value = ''; b.classList.remove('filled'); }); refreshButton(); };
    function showError(msg) {
      $('otp-error').textContent = msg || '';
      const row = $('otp-row');
      boxes.forEach((b) => b.classList.toggle('bad', !!msg));
      if (msg) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
    }

    function startCooldown(seconds) {
      cool = seconds;
      clearInterval(coolTimer);
      const btn = $('otp-resend');
      const paint = () => { btn.disabled = cool > 0; btn.textContent = cool > 0 ? `Resend code (${cool}s)` : 'Resend code'; };
      paint();
      if (cool <= 0) return;
      coolTimer = setInterval(() => { cool -= 1; paint(); if (cool <= 0) clearInterval(coolTimer); }, 1000);
    }

    function startExpiry() {
      left = CODE_LIFE;
      clearInterval(expTimer);
      const paint = () => { $('otp-exp').textContent = fmt(Math.max(left, 0)); if (left <= 0) $('otp-meta').innerHTML = 'This code has expired. <strong>Request a new one.</strong>'; };
      $('otp-meta').innerHTML = 'Code expires in <strong id="otp-exp">10:00</strong>';
      paint();
      expTimer = setInterval(() => { left -= 1; if (left > 0) paint(); else { clearInterval(expTimer); paint(); } }, 1000);
    }

    async function sendCode(announce) {
      try {
        await Api.post('/auth/resend-verification', { email });
        if (announce) toast('A new code has been sent. Check your inbox (and spam).');
        startExpiry();
        startCooldown(60);
        clearBoxes(); showError('');
        boxes[0].focus();
      } catch (err) {
        if (err.status === 429) { startCooldown(60); toast(err.message, 'error'); }
        else toast(err.message, 'error');
      }
    }

    async function verify() {
      const code = value();
      if (code.length !== 6 || busy) return;
      busy = true; refreshButton(); showError('');
      $('otp-verify').textContent = 'Verifying...';
      try {
        const data = await Api.post('/auth/verify-otp', { email, code });
        clearInterval(coolTimer); clearInterval(expTimer);
        root.querySelector('.otp-card').classList.add('success');
        $('otp-icon').innerHTML = CHECK;
        $('otp-title').textContent = 'Email verified!';
        $('otp-sub').innerHTML = 'Your account is ready. Taking you to your dashboard...';
        $('otp-row').style.display = 'none';
        $('otp-verify').style.display = 'none';
        root.querySelector('.otp-foot').style.display = 'none';
        root.querySelector('.otp-hint').style.display = 'none';
        $('otp-meta').style.display = 'none';
        Api.setSession(data.token, data.user);
        setTimeout(() => location.replace('dashboard.html'), 1100);
      } catch (err) {
        busy = false;
        $('otp-verify').textContent = 'Verify and continue';
        showError(err.message);
        if (err.code === 'OTP_INVALID') { clearBoxes(); boxes[0].focus(); }
        else { clearBoxes(); $('otp-resend').focus(); }
        refreshButton();
      }
    }

    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        box.classList.toggle('filled', !!box.value);
        showError('');
        if (box.value && i < 5) boxes[i + 1].focus();
        refreshButton();
        if (value().length === 6) verify();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); refreshButton(); }
        else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        else if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
        else if (e.key === 'Enter') verify();
      });
      box.addEventListener('focus', () => box.select());
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!digits) return;
        digits.split('').forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add('filled'); });
        boxes[Math.min(digits.length, 5)].focus();
        showError(''); refreshButton();
        if (digits.length === 6) verify();
      });
    });

    $('otp-verify').addEventListener('click', verify);
    $('otp-resend').addEventListener('click', () => sendCode(true));
    $('otp-change').addEventListener('click', () => {
      clearInterval(coolTimer); clearInterval(expTimer);
      root.innerHTML = '';
      if (opts.onChangeEmail) opts.onChangeEmail();
    });

    startExpiry();
    if (opts.autoSend) sendCode(false); else startCooldown(opts.cooldown === undefined ? 60 : opts.cooldown);
    boxes[0].focus();
  }

  window.OtpUI = { mount };
})();
