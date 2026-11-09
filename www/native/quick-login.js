/* App-only quick login: a PIN or fingerprint instead of retyping the password.
   This file is added to login.html and dashboard.html by scripts/inject-bridge.js. */
(function () {
  const KEY = "eh_quick_login";
  const SKIP_KEY = "eh_quick_login_skipped";
  const RELOCK_AFTER_MS = 2 * 60 * 1000;

  const isNative = () => !!window.Capacitor?.isNativePlatform?.();
  const biometricPlugin = () => window.Capacitor?.Plugins?.AppBiometric;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));
  const clear = () => localStorage.removeItem(KEY);

  async function biometricAvailable() {
    try { return !!(await biometricPlugin().isAvailable()).available; } catch (e) { return false; }
  }
  async function biometricPrompt(subtitle) {
    try { return !!(await biometricPlugin().authenticate({ subtitle })).success; } catch (e) { return false; }
  }

  window.QuickLogin = { isNative, read, save, clear, biometricAvailable, biometricPrompt };
  if (!isNative()) return;

  const page = location.pathname.split("/").pop();

  // ---- login.html: an enrolled phone goes to the PIN screen instead ----
  if (page === "login.html") {
    if (read() && new URLSearchParams(location.search).get("password") !== "1") location.replace("unlock.html");
    return;
  }
  if (page !== "dashboard.html") return;

  const user = () => { try { return Api.currentUser(); } catch (e) { return null; } };
  const enrolledHere = () => { const q = read(); return !!(q && user() && q.userId === user().id); };

  // ---- Lock again after a while in the background ----
  let hiddenAt = 0;
  window.Capacitor.Plugins.App?.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS && enrolledHere()) location.replace("unlock.html");
  });

  // ---- Setup sheet ----
  async function openSetup() {
    if (document.querySelector(".ql-sheet-wrap")) return;
    const canBio = await biometricAvailable();
    const wrap = document.createElement("div");
    wrap.className = "ql-sheet-wrap";
    wrap.innerHTML = `
      <form class="ql-sheet" autocomplete="off">
        <h3>Sign in faster</h3>
        <p class="muted">Create a 4-digit PIN for this phone so you don't need your password each time. This is separate from your transaction PIN.</p>
        <div class="field"><label for="ql-pin">New 4-digit PIN</label><input id="ql-pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required /></div>
        <div class="field"><label for="ql-pin2">Confirm PIN</label><input id="ql-pin2" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required /></div>
        ${canBio ? `<label class="ql-check"><input type="checkbox" id="ql-bio" checked /> Also unlock with fingerprint</label>` : ""}
        <button type="submit" class="btn btn-accent btn-block">Turn on</button>
        <button type="button" class="btn btn-ghost btn-block" id="ql-later">Not now</button>
      </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector("form");
    const pin = wrap.querySelector("#ql-pin");

    wrap.querySelector("#ql-later").addEventListener("click", () => {
      localStorage.setItem(SKIP_KEY, user()?.id || "1");
      wrap.remove();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!/^\d{4}$/.test(pin.value)) return toast("Your PIN must be exactly 4 digits.", "error");
      if (pin.value !== wrap.querySelector("#ql-pin2").value) return toast("The two PINs don't match.", "error");
      const bioBox = wrap.querySelector("#ql-bio");
      let biometric = !!bioBox?.checked;
      if (biometric && !(await biometricPrompt("Confirm your fingerprint to turn this on"))) biometric = false;
      try {
        const old = read();
        const d = await Api.post("/auth/device/enroll", { pin: pin.value, biometric, replaceDeviceId: old?.deviceId });
        const me = user();
        save({ deviceId: d.deviceId, secret: d.secret, bioSecret: d.bioSecret || null, userId: me.id, firstName: String(me.fullName || "").split(" ")[0] });
        wrap.remove();
        toast(biometric ? "PIN and fingerprint login are on." : "PIN login is on.");
        paintSettings();
      } catch (err) { toast(err.message, "error"); }
    });
    pin.focus();
  }

  // ---- Settings section ----
  function paintSettings() {
    const view = document.getElementById("view-settings");
    if (!view) return;
    let box = document.getElementById("ql-settings");
    if (!box) {
      box = document.createElement("div");
      box.id = "ql-settings";
      view.querySelector("h3")?.before(box);
    }
    const on = enrolledHere();
    const bio = on && read().bioSecret;
    box.innerHTML = `
      <h3 style="margin-top:0;">PIN &amp; fingerprint login</h3>
      <div class="card form-card" style="margin-bottom:28px;">
        <p class="muted" style="margin-top:0;">${on ? (bio ? "PIN and fingerprint login are on for this phone." : "PIN login is on for this phone.") : "Unlock the app on this phone without typing your password."}</p>
        <button type="button" class="btn btn-accent btn-block" id="ql-setup">${on ? "Change PIN or fingerprint" : "Set up"}</button>
        ${on ? `<button type="button" class="btn btn-ghost btn-block" id="ql-off" style="margin-top:10px;">Turn off</button>` : ""}
      </div>`;
    box.querySelector("#ql-setup").addEventListener("click", openSetup);
    box.querySelector("#ql-off")?.addEventListener("click", async () => {
      try {
        await Api.post("/auth/device/remove", { deviceId: read().deviceId });
        clear();
        toast("PIN and fingerprint login are off.");
        paintSettings();
      } catch (err) { toast(err.message, "error"); }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    paintSettings();
    if (!enrolledHere() && localStorage.getItem(SKIP_KEY) !== user()?.id) setTimeout(openSetup, 900);
  });
})();
