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
        if (res.status === 401) {
          localStorage.removeItem('almubarak_token');
          localStorage.removeItem('almubarak_user');
          if (!location.pathname.endsWith('login.html') && !location.pathname.endsWith('/')) {
            location.href = 'login.html';
          }
        }
        throw new Error(data.error || 'Something went wrong. Please try again.');
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
