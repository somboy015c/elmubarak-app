# Elmubarak Digital Hub — Mobile App Shell

A native-feeling Android/iOS wrapper (Capacitor) around your existing VTU web app
(`somboy015c/almubarak`), with a custom splash screen, 3-slide onboarding, and a
Flutter-Material-style shell (hamburger drawer, bottom nav, floating action button)
around your live authenticated app pages.

## How it works

Rather than re-hosting or rewriting your web app's code, this shell:

1. Shows a native splash screen and onboarding (first run only).
2. Loads **your live sign-in page** in an in-app view.
3. After login, loads your **authenticated routes** (`/dashboard`, `/pay`,
   `/transactions`, `/profile`, etc.) inside a full-screen frame, wrapped with a
   native bottom nav, hamburger drawer, and FAB.
4. It never loads your public marketing landing page or the "Download App"
   banner — because those routes are simply never requested. Content updates on
   your live site appear instantly, with **no app rebuild needed**.

The GitHub Action (`.github/workflows/update-and-build.yml`) is for when you *do*
want a fresh signed build cut — e.g. for the Play Store, or after changing the
shell itself (icon, splash, onboarding copy, routes).

## 1. Configure your URLs

Edit `www/js/app.js` → `APP_CONFIG`:

```js
BASE_URL: "https://app.elmubarak.com",   // your real domain
ROUTES: {
  auth: "/signin",
  home: "/dashboard",
  pay: "/pay",
  transactions: "/transactions",
  profile: "/profile",
  ...
}
```

Also update `capacitor.config.json` → `server.allowNavigation` with your real domain.

## 2. Optional but recommended: instant login handoff

Cross-origin frames can't be read by the shell for security reasons, so by
default a "Continue →" button appears 6s after the sign-in page loads, letting
the user proceed once they've logged in. For an instant, automatic handoff, add
this single line to your web app's login-success handler:

```js
window.parent.postMessage({ type: "elmubarak:auth", status: "success" }, "*");
```

If your "Download the app" button ever appears on an authenticated page (not
just the landing page), hide it when running inside this shell with:

```js
if (window.self !== window.top) {
  document.querySelector(".download-app-btn")?.style.setProperty("display", "none");
}
```

## 3. First-time native project setup (run locally, once)

```bash
npm install
npx cap add android
npx cap add ios          # optional, needs a Mac + Xcode
npx capacitor-assets generate   # generates all icon/splash sizes from assets/icon.png + assets/splash.png
npx cap sync
```

Commit the generated `android/` (and `ios/`) folders — GitHub Actions builds
from them, it doesn't regenerate the native projects from scratch.

## 4. Publish the repo

```bash
git init
git add .
git commit -m "Initial mobile shell for Elmubarak Digital Hub"
git branch -M main
git remote add origin https://github.com/<your-username>/elmubarak-digital-hub.git
git push -u origin main
```

## 5. The "update" Action button

Go to **Actions → Update from Web App & Build → Run workflow** any time. It:

- Checks the latest commit on `somboy015c/almubarak`.
- If there's something new (or you tick "force rebuild"), bumps the Android
  version code, runs `cap sync`, builds an APK, and uploads it as a workflow
  artifact.
- Also runs automatically once a day (edit the `cron` line to change that).

For a **signed release APK** (needed for the Play Store), add these repo secrets
and extend the workflow's build step to decode the keystore and run
`./gradlew assembleRelease` instead of `assembleDebug`:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Assets included

- `assets/icon.png` — 1024×1024 app icon (branded background + your logo)
- `assets/icon-foreground.png` / `icon-background.png` — for Android adaptive icons
- `assets/splash.png` / `splash-dark.png` — 2732×2732 splash source images

Run `npx capacitor-assets generate` after editing these to regenerate every
platform size automatically.

## What I couldn't do from this chat

I don't have network access in this environment, so I couldn't clone
`somboy015c/almubarak`, create the GitHub repo, or push anything for you — the
steps above cover that. If you want the whole thing (clone → wire up real
routes → build → push → set up secrets) done end-to-end without doing it
yourself, that's a good fit for **Claude Code** (desktop or CLI), which has real
repo and terminal access.
