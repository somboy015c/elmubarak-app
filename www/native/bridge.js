/* Injected on top of your existing js/dashboard.js — never edited, only added to.
   Everything here just DRIVES your existing .nav-item[data-view] buttons and
   .view sections; it doesn't reimplement any of your app logic. */
(function () {
  document.documentElement.classList.add("eh-native-shell");

  // Which of your existing sidebar views show up as bottom-tab shortcuts.
  // Edit this list if you'd rather surface different views (any data-view
  // value that exists in dashboard.html works).
  const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const TABS = [
    { view: "home", label: "Home", icon: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>') },
    { view: "fund", label: "Fund", icon: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>') },
    { view: "transactions", label: "History", icon: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>') },
    { view: "settings", label: "Profile", icon: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>') }
  ];

  function buildBottomNav() {
    const nav = document.createElement("nav");
    nav.className = "eh-bottom-nav";
    nav.innerHTML = TABS.map(t =>
      `<button class="eh-nav-item" data-eh-view="${t.view}">
         <span class="eh-ic">${t.icon}</span>${t.label}
       </button>`
    ).join("");
    document.body.appendChild(nav);

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".eh-nav-item");
      if (!btn) return;
      try { window.Capacitor?.Plugins?.Haptics?.impact({ style: "light" }); } catch (err) {}
      const view = btn.dataset.ehView;
      // Trigger your app's own click handler on the matching sidebar item —
      // we never touch your view-switching logic directly.
      document.querySelector(`.nav-item[data-view="${view}"]`)?.click();
      highlightTab(view);
    });

    highlightTab("home");
  }

  function highlightTab(view) {
    document.querySelectorAll(".eh-nav-item").forEach(b =>
      b.classList.toggle("eh-active", b.dataset.ehView === view));
  }

  // Keep the bottom nav in sync if the user navigates via the sidebar itself
  // (desktop layout, or a view your own code switches to programmatically).
  function watchViewChanges() {
    document.querySelectorAll(".nav-item[data-view]").forEach(item => {
      item.addEventListener("click", () => {
        const view = item.dataset.view;
        if (TABS.some(t => t.view === view)) highlightTab(view);
      });
    });

    // Keep the bottom nav highlight right when a view is opened from a home
    // tile or by your own code. (The entrance animation is pure CSS now: the
    // old class-watching version re-triggered itself forever and froze the app.)
    const observer = new MutationObserver(() => {
      const active = document.querySelector(".view.active");
      if (active) highlightTab(active.id.replace("view-", ""));
    });
    document.querySelectorAll(".view").forEach(el =>
      observer.observe(el, { attributes: true, attributeFilter: ["class"] }));
  }

  // Android hardware back button: close the drawer if open, else go back to
  // the home view, else leave the app.
  function wireBackButton() {
    if (!window.Capacitor?.Plugins?.App) return;
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      const sidebar = document.getElementById("sidebar");
      const toggle = document.getElementById("sidebar-toggle");
      if (sidebar && sidebar.classList.contains("open")) {
        toggle?.click();
        return;
      }
      const activeView = document.querySelector(".view.active");
      if (activeView && activeView.id !== "view-home") {
        document.querySelector('.nav-item[data-view="home"]')?.click();
        return;
      }
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
    buildBottomNav();
    watchViewChanges();
    wireBackButton();
    wireStatusBar();
  });
})();
