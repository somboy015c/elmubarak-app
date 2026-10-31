// ---- Global loading overlay ----
// A counter (not a boolean) so overlapping requests don't hide the
// spinner early — it only disappears once every in-flight call is done.
let _loaderCount = 0;

function _loaderEl() {
  let el = document.getElementById('global-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loader';
    el.className = 'global-loader';
    el.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(el);
  }
  return el;
}

function showLoader() {
  _loaderCount++;
  _loaderEl().classList.add('active');
}

function hideLoader() {
  _loaderCount = Math.max(0, _loaderCount - 1);
  if (_loaderCount === 0) {
    _loaderEl().classList.remove('active');
  }
}

const Api = (() => {
  function token() {
    return localStorage.getItem('almubarak_token');
  }

  async function request(path, { method = 'GET', body } = {}) {
    showLoader();
    try {
      const headers = { 'Content-Type': 'application/json' };
      const t = token();
      if (t) headers.Authorization = `Bearer ${t}`;

      let res;
      try {
        res = await fetch(`${window.API_BASE_URL}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (err) {
        throw new Error('Could not reach the server. Check your connection and try again.');
      }

      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        /* no JSON body */
      }

      if (!res.ok) {
        if (res.status === 401 || (res.status === 403 && data.code === 'ACCOUNT_SUSPENDED' && token())) {
          const suspended = res.status === 403;
          localStorage.removeItem('almubarak_token');
          localStorage.removeItem('almubarak_user');
          const publicPages = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html', 'verify-email.html', 'index.html'];
          const here = location.pathname.split('/').pop() || 'index.html';
          if (!publicPages.includes(here)) {
            location.replace(suspended ? 'login.html?suspended=1' : 'login.html');
          }
        }
        const apiErr = new Error(data.error || 'Something went wrong. Please try again.');
        apiErr.code = data.code;
        apiErr.status = res.status;
        apiErr.data = data;
        throw apiErr;
      }

      return data;
    } finally {
      hideLoader();
    }
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    setSession(token, user) {
      const isNewLogin = localStorage.getItem('almubarak_token') !== token;
      localStorage.setItem('almubarak_token', token);
      localStorage.setItem('almubarak_user', JSON.stringify(user));
      if (isNewLogin) localStorage.setItem('almubarak_last_active', String(Date.now())); // a fresh login starts the idle clock
    },
    clearSession() {
      localStorage.removeItem('almubarak_token');
      localStorage.removeItem('almubarak_user');
      localStorage.removeItem('almubarak_last_active');
      localStorage.removeItem('pending_funding_ref');
    },
    // Log out: wipe the session and load the login page fresh (no stale data left behind).
    logout() {
      showLoader();
      this.clearSession();
      location.replace('login.html');
    },
    // Download a file (e.g. CSV export) from an admin endpoint.
    async download(path, filename) {
      showLoader();
      try {
        const res = await fetch(`${window.API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error('Could not download the file.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        hideLoader();
      }
    },
    currentUser() {
      const raw = localStorage.getItem('almubarak_user');
      return raw ? JSON.parse(raw) : null;
    },
    isLoggedIn: () => !!token()
  };
})();

function toast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Always show fresh data after logging in or out:
// - coming back with the browser's Back/Forward buttons reloads the page instead of showing an old copy
// - logging in or out in one tab refreshes every other open tab
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});
window.addEventListener('storage', (e) => {
  if (e.key === 'almubarak_token') location.reload();
});

// ---- Automatic logout after 15 minutes of inactivity ----
// "Inactivity" means the person did nothing on the page (no mouse, keys, taps or scrolling) in ANY open tab.
// Background refreshes (balance, notices) do not count as activity. A warning appears for the last minute.
(function idleWatch() {
  const LIMIT = 15 * 60 * 1000;
  const WARN_AT = 14 * 60 * 1000;
  const KEY = 'almubarak_last_active';
  if (!localStorage.getItem('almubarak_token')) return; // not logged in: nothing to watch

  const last = () => Number(localStorage.getItem(KEY)) || 0;
  if (!last()) localStorage.setItem(KEY, String(Date.now())); // sessions from before this feature

  let lastWrite = 0;
  let bar = null;

  function hideWarning() {
    if (bar) { bar.remove(); bar = null; }
  }

  function showWarning(secondsLeft) {
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:9999;max-width:460px;margin:0 auto;background:#14231B;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,.3);font:500 14px/1.45 Poppins,Arial,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between;';
      bar.innerHTML = '<span id="idle-msg"></span><button type="button" id="idle-stay" style="background:#C9A24B;color:#14231B;border:0;border-radius:10px;padding:9px 14px;font:700 13px Poppins,Arial,sans-serif;cursor:pointer;white-space:nowrap;">Stay logged in</button>';
      document.body.appendChild(bar);
      bar.querySelector('#idle-stay').addEventListener('click', () => touch(true));
    }
    bar.querySelector('#idle-msg').textContent = `You will be logged out in ${secondsLeft}s because you have been inactive.`;
  }

  function touch(force) {
    const t = Date.now();
    if (force || t - lastWrite > 3000) {
      lastWrite = t;
      try { localStorage.setItem(KEY, String(t)); } catch (e) { /* storage unavailable */ }
    }
    if (force) hideWarning();
  }

  function idleLogout() {
    localStorage.removeItem('almubarak_token');
    localStorage.removeItem('almubarak_user');
    localStorage.removeItem(KEY);
    localStorage.removeItem('pending_funding_ref');
    location.replace('login.html?idle=1');
  }

  function check() {
    if (!localStorage.getItem('almubarak_token')) return;
    const idle = Date.now() - last();
    if (idle >= LIMIT) return idleLogout();
    if (idle >= WARN_AT) showWarning(Math.max(1, Math.ceil((LIMIT - idle) / 1000)));
    else hideWarning();
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((ev) =>
    window.addEventListener(ev, () => touch(false), { passive: true, capture: true })
  );
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  setInterval(check, 5000);
  check(); // e.g. the laptop was asleep for an hour: log out straight away
})();
