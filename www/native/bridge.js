/* Injected on top of your existing js/dashboard.js — never edited, only added to.
   Everything here just DRIVES your existing .nav-item[data-view] buttons and
   .view sections; it doesn't reimplement any of your app logic. */
(function () {
  document.documentElement.classList.add("eh-native-shell");

  // Which of your existing sidebar views show up as bottom-tab shortcuts.
  // Edit this list if you'd rather surface different views (any data-view
  // value that exists in dashboard.html works).
  const TABS = [
    { view: "home", label: "Home", icon: "🏠" },
    { view: "fund", label: "Fund", icon: "💳" },
    { view: "transactions", label: "History", icon: "🧾" },
    { view: "settings", label: "Profile", icon: "👤" }
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

    // Light entrance animation whenever a .view becomes active, regardless
    // of how your own code toggles it.
    const observer = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.attributeName !== "class") return;
        const el = m.target;
        if (el.classList.contains("view") && el.classList.contains("active")) {
          el.classList.add("eh-entering");
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("eh-entering")));
        }
      });
    });
    document.querySelectorAll(".view").forEach(el =>
      observer.observe(el, { attributes: true }));
  }

  // Android hardware back button: close the drawer if open, else go back a
  // view, else let Capacitor's default (minimize app) happen.
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
      }
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
