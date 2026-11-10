/* App-only layer on top of the website's js/dashboard.js. It never changes that file:
   it hides the website's menu, adds native-style navigation, and drives the website's
   own .nav-item[data-view] buttons and .view sections to switch screens. */
(function () {
  document.documentElement.classList.add("eh-native-shell");

  const $ = (id) => document.getElementById(id);
  const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    fund: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
    profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
    bell: svg('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
    chat: svg('<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>')
  };

  // Bottom tabs. "more" opens the full-screen menu instead of a view.
  const TABS = [
    { view: "home", label: "Home", icon: ICON.home },
    { view: "fund", label: "Fund", icon: ICON.fund },
    { view: "transactions", label: "History", icon: ICON.history },
    { view: "settings", label: "Profile", icon: ICON.profile },
    { view: "more", label: "More", icon: ICON.more }
  ];

  // Groups on the More screen, using the website's own menu items.
  const GROUPS = [
    { title: "Buy & pay", views: ["airtime", "data", "electricity", "cable", "exam", "airtime2cash"] },
    { title: "Wallet", views: ["fund", "transfer", "withdraw", "transactions"] },
    { title: "Account", views: ["notices", "settings"] }
  ];

  // Short titles for the top bar. Anything missing falls back to the view's own heading.
  const TITLES = {
    airtime: "Airtime", data: "Data", electricity: "Electricity", cable: "Cable TV", exam: "Exam PINs",
    transactions: "History", fund: "Fund wallet", transfer: "Transfer", withdraw: "Withdraw",
    airtime2cash: "Airtime to cash", notices: "Notices", settings: "Profile & settings"
  };

  const haptic = () => { try { window.Capacitor?.Plugins?.Haptics?.impact({ style: "light" }); } catch (e) {} };
  const navItem = (view) => document.querySelector(`.sidebar .nav-item[data-view="${view}"]`);
  const activeView = () => (document.querySelector(".view.active")?.id || "view-home").replace("view-", "");
  const open = (view) => { navItem(view)?.click(); window.scrollTo(0, 0); };

  // ---------- Top bar ----------
  function buildTopBar() {
    const bar = document.createElement("header");
    bar.className = "eh-topbar";
    bar.innerHTML = `
      <button type="button" class="eh-icon-btn" id="eh-back" aria-label="Back">${ICON.back}</button>
      <img class="eh-top-logo" src="assets/logo-wide.png" alt="Elmubarak Digital Hub" />
      <h1 class="eh-top-title" id="eh-title"></h1>
      <button type="button" class="eh-icon-btn" id="eh-bell" aria-label="Notices">${ICON.bell}<span class="eh-dot" id="eh-bell-dot"></span></button>`;
    document.querySelector(".main-area")?.prepend(bar);
    $("eh-back").addEventListener("click", () => { haptic(); open("home"); });
    $("eh-bell").addEventListener("click", () => { haptic(); open("notices"); });

    // Mirror the website's unread count onto the bell.
    const dot = $("notice-dot");
    const sync = () => {
      const shown = dot && dot.style.display !== "none" && dot.textContent.trim() !== "0" && dot.textContent.trim() !== "";
      $("eh-bell-dot").textContent = shown ? dot.textContent : "";
      $("eh-bell-dot").style.display = shown ? "flex" : "none";
    };
    if (dot) new MutationObserver(sync).observe(dot, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();
  }

  function paintTopBar() {
    const view = activeView();
    const home = view === "home";
    document.documentElement.classList.toggle("eh-on-home", home);
    const heading = document.querySelector(`#view-${view} > h2`);
    $("eh-title").textContent = home ? "" : (TITLES[view] || heading?.textContent || "");
  }

  // ---------- Bottom nav ----------
  function buildBottomNav() {
    const nav = document.createElement("nav");
    nav.className = "eh-bottom-nav";
    nav.innerHTML = TABS.map((t) =>
      `<button type="button" class="eh-nav-item" data-eh-view="${t.view}"><span class="eh-ic">${t.icon}</span>${t.label}</button>`).join("");
    document.body.appendChild(nav);
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".eh-nav-item");
      if (!btn) return;
      haptic();
      if (btn.dataset.ehView === "more") return openMore();
      closeMore();
      open(btn.dataset.ehView);
    });
  }

  function highlightTab() {
    const view = moreOpen() ? "more" : activeView();
    document.querySelectorAll(".eh-nav-item").forEach((b) => b.classList.toggle("eh-active", b.dataset.ehView === view));
  }

  // ---------- More screen ----------
  const moreOpen = () => !!$("eh-more")?.classList.contains("open");

  function buildMore() {
    const el = document.createElement("div");
    el.id = "eh-more";
    el.className = "eh-more";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "All options");
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-eh-go]");
      if (!tile) return;
      haptic();
      const go = tile.dataset.ehGo;
      closeMore();
      if (go === "logout") return $("logout-btn")?.click();
      if (go === "admin") return void (location.href = "admin.html");
      if (go === "whatsapp") return;
      open(go);
    });
  }

  function paintMore() {
    const user = (() => { try { return Api.currentUser() || {}; } catch (e) { return {}; } })();
    const tile = (view) => {
      const item = navItem(view);
      if (!item || item.dataset.off === "1") return "";
      const icon = item.querySelector("svg")?.outerHTML || "";
      const label = TITLES[view] && view !== "settings" ? TITLES[view] : item.textContent.trim();
      return `<button type="button" class="eh-tile" data-eh-go="${view}"><span class="eh-tile-ic">${icon}</span><span>${label}</span></button>`;
    };
    const wa = document.querySelector(".whatsapp-float-btn")?.getAttribute("href");
    const admin = $("admin-link") && $("admin-link").style.display !== "none";
    $("eh-more").innerHTML = `
      <div class="eh-more-head">
        <h2>All options</h2>
        <button type="button" class="eh-icon-btn" id="eh-more-close" aria-label="Close">${ICON.close}</button>
      </div>
      <div class="eh-more-body">
        <div class="eh-more-user">
          <span class="eh-avatar">${String(user.fullName || "?").trim().charAt(0).toUpperCase()}</span>
          <span><strong>${escapeHtml(user.fullName || "")}</strong><small>${escapeHtml(user.email || "")}</small></span>
        </div>
        ${GROUPS.map((g) => {
          const tiles = g.views.map(tile).join("");
          return tiles ? `<h3>${g.title}</h3><div class="eh-grid">${tiles}</div>` : "";
        }).join("")}
        <h3>Help</h3>
        <div class="eh-list">
          ${wa ? `<a class="eh-row" data-eh-go="whatsapp" href="${wa}" target="_blank" rel="noopener">${ICON.chat}<span>Chat with support on WhatsApp</span></a>` : ""}
          ${admin ? `<button type="button" class="eh-row" data-eh-go="admin">${svg('<path d="M12 2 3 6v6c0 5 3.8 8.5 9 10 5.2-1.5 9-5 9-10V6l-9-4z"/>')}<span>Admin panel</span></button>` : ""}
          <button type="button" class="eh-row eh-danger" data-eh-go="logout">${ICON.logout}<span>Log out</span></button>
        </div>
      </div>`;
    $("eh-more-close").addEventListener("click", closeMore);
  }

  function openMore() {
    paintMore();
    $("eh-more").classList.add("open");
    document.documentElement.classList.add("eh-more-open");
    highlightTab();
  }
  function closeMore() {
    if (!moreOpen()) return;
    $("eh-more").classList.remove("open");
    document.documentElement.classList.remove("eh-more-open");
    highlightTab();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "SME2" stays SME2, "CORPORATE GIFTING" becomes "Corporate Gifting".
  const planTypeName = (raw) => String(raw).split(/\s+/).map((w) =>
    /^SME\d*$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  // ---------- Data plan type as a dropdown instead of a row of chips ----------
  function buildDataCategorySelect() {
    const chips = $("data-categories");
    if (!chips) return;
    const wrap = document.createElement("div");
    wrap.className = "eh-select-wrap";
    wrap.innerHTML = `<select id="eh-data-cat" aria-label="Plan type"></select>`;
    chips.after(wrap);
    const select = $("eh-data-cat");
    const sync = () => {
      const buttons = [...chips.querySelectorAll("[data-cat]")];
      select.innerHTML = buttons.map((b) => {
        const count = b.querySelector("small")?.textContent.replace(/[()]/g, "").trim();
        const name = planTypeName(b.dataset.cat);
        const plans = count ? ` · ${count} ${count === "1" ? "plan" : "plans"}` : "";
        return `<option value="${escapeHtml(b.dataset.cat)}" ${b.classList.contains("active") ? "selected" : ""}>${escapeHtml(name)}${plans}</option>`;
      }).join("");
    };
    new MutationObserver(sync).observe(chips, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    select.addEventListener("change", () => {
      chips.querySelector(`[data-cat="${CSS.escape(select.value)}"]`)?.click();
    });
    sync();
  }

  // ---------- Keep everything in step with the website's own view switching ----------
  function watchViews() {
    const update = () => { paintTopBar(); highlightTab(); };
    const observer = new MutationObserver(update);
    document.querySelectorAll(".view").forEach((el) => observer.observe(el, { attributes: true, attributeFilter: ["class"] }));
    update();
  }

  // Android back button: close the More screen or a popup, then go home, then leave the app.
  function wireBackButton() {
    if (!window.Capacitor?.Plugins?.App) return;
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      if (moreOpen()) return closeMore();
      const sheet = document.querySelector(".ql-sheet-wrap");
      if (sheet) return sheet.querySelector("#ql-later")?.click();
      const modal = $("modal-root");
      if (modal && getComputedStyle(modal).display !== "none") {
        const cancel = [...modal.querySelectorAll("button")].find((b) => /cancel|close|done|ok/i.test(b.textContent));
        if (cancel) return cancel.click();
      }
      if (activeView() !== "home") return open("home");
      window.Capacitor.Plugins.App.exitApp();
    });
  }

  function wireStatusBar() {
    try {
      window.Capacitor?.Plugins?.StatusBar?.setBackgroundColor({ color: "#FFFFFF" });
      window.Capacitor?.Plugins?.StatusBar?.setStyle({ style: "LIGHT" });
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildTopBar();
    buildBottomNav();
    buildMore();
    buildDataCategorySelect();
    watchViews();
    wireBackButton();
    wireStatusBar();
  });
})();
