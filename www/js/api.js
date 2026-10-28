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
      localStorage.setItem('almubarak_token', token);
      localStorage.setItem('almubarak_user', JSON.stringify(user));
    },
    clearSession() {
      localStorage.removeItem('almubarak_token');
      localStorage.removeItem('almubarak_user');
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
