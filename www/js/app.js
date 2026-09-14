/* =========================================================================
   ELMUBARAK DIGITAL HUB — Splash + Onboarding controller
   This file only runs on the shell's own index.html. Once onboarding is
   done, it hands off to your REAL, synced pages (login.html / dashboard.html)
   — those files are untouched, pulled straight from your web repo.
   ========================================================================= */
const APP_CONFIG = {
  SPLASH_MIN_MS: 1600,
  SKIP_ONBOARDING_AFTER_FIRST_RUN: true,

  // Matches Api.setSession()/token() in js/api.js exactly.
  SESSION_TOKEN_KEY: "almubarak_token",

  LOGIN_PAGE: "login.html",
  DASHBOARD_PAGE: "dashboard.html"
};

const $ = (sel) => document.querySelector(sel);
const screens = { splash: $("#splash"), onboarding: $("#onboarding") };
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function isAlreadyLoggedIn() {
  try { return !!localStorage.getItem(APP_CONFIG.SESSION_TOKEN_KEY); }
  catch (e) { return false; }
}

function handOff() {
  location.href = isAlreadyLoggedIn() ? APP_CONFIG.DASHBOARD_PAGE : APP_CONFIG.LOGIN_PAGE;
}

/* ---------- SPLASH ---------- */
async function bootSplash() {
  const start = Date.now();
  try {
    if (window.Capacitor?.Plugins?.SplashScreen) window.Capacitor.Plugins.SplashScreen.hide();
  } catch (e) {}
  const wait = Math.max(0, APP_CONFIG.SPLASH_MIN_MS - (Date.now() - start));
  await new Promise(r => setTimeout(r, wait));

  const seenOnboarding = localStorage.getItem("elmubarak_onboarded") === "1";
  if (seenOnboarding && APP_CONFIG.SKIP_ONBOARDING_AFTER_FIRST_RUN) handOff();
  else showScreen("onboarding");
}

/* ---------- ONBOARDING ---------- */
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
  handOff();
}

bootSplash();
