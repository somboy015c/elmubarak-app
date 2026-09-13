/* =========================================================================
   ELMUBARAK DIGITAL HUB — App Shell Config
   Edit APP_CONFIG below to point at your live web app's URLs.
   ========================================================================= */
const APP_CONFIG = {
  BASE_URL: "https://REPLACE-WITH-YOUR-WEB-APP-DOMAIN", // e.g. https://app.elmubarak.com
  ROUTES: {
    auth:         "/signin",        // your sign-in page (NOT the marketing landing page)
    home:         "/dashboard",
    pay:          "/pay",
    transactions: "/transactions",
    profile:      "/profile",
    rewards:      "/rewards",
    support:      "/support",
    settings:     "/settings",
    logout:       "/logout"
  },
  SPLASH_MIN_MS: 1600,
  SKIP_ONBOARDING_AFTER_FIRST_RUN: true
};

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const screens = {
  splash: $("#splash"), onboarding: $("#onboarding"),
  auth: $("#authHost"), app: $("#appHost")
};
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

/* ---------- 1. SPLASH ---------- */
async function bootSplash() {
  const start = Date.now();
  try {
    if (window.Capacitor?.Plugins?.SplashScreen) {
      // native splash (from capacitor-assets) already showing behind this HTML splash
      window.Capacitor.Plugins.SplashScreen.hide();
    }
  } catch (e) {}
  const elapsed = Date.now() - start;
  const wait = Math.max(0, APP_CONFIG.SPLASH_MIN_MS - elapsed);
  await new Promise(r => setTimeout(r, wait));

  const seenOnboarding = localStorage.getItem("elmubarak_onboarded") === "1";
  if (seenOnboarding && APP_CONFIG.SKIP_ONBOARDING_AFTER_FIRST_RUN) {
    goToAuth();
  } else {
    showScreen("onboarding");
  }
}

/* ---------- 2. ONBOARDING ---------- */
const obTrack = $("#obTrack");
const obDots = document.querySelectorAll(".ob-dot");
const slideCount = document.querySelectorAll(".ob-slide").length;
let obIndex = 0;

function renderOnboarding() {
  obTrack.style.transform = `translateX(-${obIndex * 100}%)`;
  obDots.forEach((d, i) => d.classList.toggle("active", i === obIndex));
  $("#obNext").innerHTML = obIndex === slideCount - 1 ? "Get Started" : "Next <span>→</span>";
}
$("#obNext").addEventListener("click", () => {
  if (obIndex < slideCount - 1) { obIndex++; renderOnboarding(); }
  else finishOnboarding();
});
$("#obSkip").addEventListener("click", finishOnboarding);

// swipe support
let touchStartX = null;
obTrack.addEventListener("touchstart", e => touchStartX = e.touches[0].clientX, {passive:true});
obTrack.addEventListener("touchend", e => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (dx < -40 && obIndex < slideCount - 1) { obIndex++; renderOnboarding(); }
  else if (dx > 40 && obIndex > 0) { obIndex--; renderOnboarding(); }
  touchStartX = null;
});

function finishOnboarding() {
  localStorage.setItem("elmubarak_onboarded", "1");
  goToAuth();
}

/* ---------- 3. AUTH ---------- */
function goToAuth() {
  const frame = $("#authFrame");
  const loading = $("#authLoading");
  loading.classList.remove("hide");
  frame.src = APP_CONFIG.BASE_URL + APP_CONFIG.ROUTES.auth;
  frame.onload = () => loading.classList.add("hide");
  showScreen("auth");

  // Recommended: from your web app, after a successful login, run:
  //   window.parent.postMessage({ type: "elmubarak:auth", status: "success" }, "*");
  // That lets the shell hand off to the native dashboard instantly.
  window.addEventListener("message", onAuthMessage);
}
function onAuthMessage(e) {
  if (e.data && e.data.type === "elmubarak:auth" && e.data.status === "success") {
    window.removeEventListener("message", onAuthMessage);
    enterApp();
  }
}
// Fallback continue button in case postMessage isn't wired up yet in the web app
setTimeout(() => {
  if (!screens.auth.classList.contains("active")) return;
  const btn = document.createElement("button");
  btn.textContent = "Already signed in? Continue →";
  btn.style.cssText = "position:absolute;left:16px;right:16px;bottom:18px;z-index:7;background:#1B2A42;color:#fff;" +
    "border:none;border-radius:14px;padding:13px;font-weight:700;font-size:13.5px;box-shadow:0 8px 20px rgba(0,0,0,.2);";
  btn.onclick = enterApp;
  screens.auth.appendChild(btn);
}, 6000);

/* ---------- 4. DASHBOARD APP ---------- */
function enterApp() {
  showScreen("app");
  navigateTo("home");
}
function navigateTo(routeKey) {
  const path = APP_CONFIG.ROUTES[routeKey];
  if (!path) return;
  const frame = $("#appFrame");
  const loading = $("#appLoading");
  loading.classList.remove("hide");
  frame.src = APP_CONFIG.BASE_URL + path;
  frame.onload = () => loading.classList.add("hide");

  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.route === routeKey));
  const titles = { home:"Home", pay:"Pay", transactions:"Transactions", profile:"Profile",
    rewards:"Rewards", support:"Support", settings:"Settings" };
  $("#topbarTitle").textContent = titles[routeKey] || "Elmubarak";
  closeDrawer();
}
document.querySelectorAll(".nav-item").forEach(btn =>
  btn.addEventListener("click", () => navigateTo(btn.dataset.route)));

$("#fabAdd").addEventListener("click", () => navigateTo("pay"));

/* ---------- DRAWER ---------- */
const drawer = $("#drawer"), scrim = $("#drawerScrim");
function openDrawer() { drawer.classList.add("open"); scrim.classList.add("open"); }
function closeDrawer() { drawer.classList.remove("open"); scrim.classList.remove("open"); }
$("#btnMenu").addEventListener("click", openDrawer);
scrim.addEventListener("click", closeDrawer);
document.querySelectorAll(".drawer-link[data-route]").forEach(btn =>
  btn.addEventListener("click", () => navigateTo(btn.dataset.route)));
$("#drawerLogout").addEventListener("click", () => {
  closeDrawer();
  localStorage.removeItem("elmubarak_onboarded");
  showScreen("auth");
  goToAuth();
});

/* ---------- ANDROID BACK BUTTON ---------- */
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener("backButton", () => {
    if (drawer.classList.contains("open")) { closeDrawer(); return; }
    if (screens.app.classList.contains("active")) {
      const frame = $("#appFrame");
      try { frame.contentWindow.history.back(); } catch (e) {}
    }
  });
}

/* ---------- BOOT ---------- */
bootSplash();
