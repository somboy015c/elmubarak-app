# Elmubarak Digital Hub — Mobile App

A native Android/iOS wrapper (Capacitor) that runs your **actual** web app —
`login.html`, `register.html`, `dashboard.html`, `admin.html`, `css/style.css`,
`js/*.js`, `assets/` — straight from
[`somboy015c/almubarak`](https://github.com/somboy015c/almubarak), plus a thin
native layer on top: animated splash screen (white bg, your exact brand green
`#146C43`), a 3-slide photo onboarding, and a bottom nav that drives your
existing dashboard sidebar. Your real files are already bundled in this zip
— not placeholders — so this is ready to build as-is.

## How it's different from the first draft

This isn't a wrapper that loads your live site in an iframe — your actual
source files are bundled directly into `www/`, so:

- The app is the same code you ship to GitHub Pages — same forms, same
  `js/dashboard.js` logic, same `css/style.css` styling (including your own
  green/white brand palette — the shell now matches it exactly). Nothing is
  rebuilt or rewritten.
- It works offline-first (bundled, not streamed from a URL).
- `index.html` is the one exception — your marketing landing page is
  intentionally **not** bundled. The shell's own `index.html` (splash +
  onboarding) is the entry point, and hands off straight to `login.html` /
  `dashboard.html`.
- `scripts/sync-source.js` still exists so the GitHub Action can re-pull
  these same files from your repo on every future update — see below.

## How the pieces fit together

```
www/
  index.html         ← shell-owned: splash + onboarding (never overwritten)
  login.html          ┐
  register.html        │ pulled from your repo by scripts/sync-source.js,
  dashboard.html        │ untouched except one injected <link>/<script> tag
  admin.html            │ in dashboard.html (see below)
  css/, js/, assets/  ┘
  native/
    bridge.css        ← shell-owned: bottom nav styling, native motion
    bridge.js         ← shell-owned: builds the bottom nav, wires it to
                          your existing .nav-item[data-view] buttons
```

`scripts/inject-bridge.js` adds exactly two lines to `dashboard.html` — a
`<link>` to `native/bridge.css` and a `<script>` for `native/bridge.js` —
nothing else in the file changes. The bridge script finds your real sidebar
buttons (`.nav-item[data-view="home"]`, `[data-view="fund"]`, etc.) and just
clicks them; it never reimplements your view-switching logic.

## 1. One thing to confirm before your first build
**Backend CORS — this is the one thing most likely to break login/signup
in the app even though the web version works fine.** `window.API_BASE_URL`
(`https://almubarak-backend.onrender.com/api`, from your `js/config.js`)
now gets called from the app's bundled origin (`https://localhost` inside
the Capacitor webview) instead of `somboy015c.github.io`. I tried to check
your backend's CORS headers directly but Render blocks automated requests
to it (robots rules), so I couldn't confirm this from here — you'll need to
check it yourself: add `https://localhost` (and, if you build for iOS,
`capacitor://localhost`) to whatever origin allowlist your backend's CORS
middleware uses (commonly a `CLIENT_ORIGIN` env var on the Render service,
or a hardcoded array in an `app.use(cors(...))` call). If it's currently
just `somboy015c.github.io`, that's almost certainly why the app can't
reach it while the website works fine.

The session check itself is already wired up correctly — the shell reads
`localStorage.getItem("almubarak_token")` on launch, matching
`Api.token()`/`Api.setSession()` in your `js/api.js` exactly, so returning
users skip straight to `dashboard.html` and expired/cleared sessions
(`Api`'s own 401 handling already does `localStorage.removeItem` +
redirect) land back on `login.html` as expected.

### "App isn't connecting to the backend" — how to diagnose it

`js/api.js`'s own error message ("Could not reach the server. Check your
connection and try again.") shows up any time `fetch()` itself throws — that
almost always means one of these, in order of likelihood:

1. **CORS** (see above) — open the app, try to sign in, and check
   `adb logcat` or Chrome's `chrome://inspect` (plug the phone in, inspect
   the webview) for a console error mentioning "CORS" or "blocked by
   CORS policy." This is the #1 cause.
2. **Cleartext HTTP blocked.** If `window.API_BASE_URL` in `js/config.js`
   ever points at `http://` instead of `https://`, Android blocks it by
   default. Render backends are `https://` out of the box, so check
   `js/config.js` if this comes up.
3. **Render cold start.** Free-tier Render services sleep after
   inactivity — the first request after a while can take 30–60s and time
   out. Not a bug, just worth ruling out before chasing anything else.
4. **Missing `INTERNET` permission** — `npx cap add android` adds this to
   `AndroidManifest.xml` automatically, but worth a quick check if you've
   hand-edited that file.

The fastest way to actually pin it down: plug an Android device/emulator
into Chrome DevTools (`chrome://inspect/#devices`) while the app is open,
try signing in, and read the exact error in the Console/Network tab — then
send me that exact message and I can tell you precisely which of the above
it is instead of guessing.

## 2. First-time native project setup (run locally, once)

```bash
npm install
node scripts/sync-source.js      # pulls your real pages into www/
npx cap add android
npx cap add ios                  # optional, needs a Mac + Xcode
npx capacitor-assets generate    # generates every icon/splash size from assets/icon.png + assets/splash.png
npx cap sync
```

Commit the generated `android/` (and `ios/`) folders — CI builds from them,
it doesn't regenerate the native shell from scratch each time.

## 3. Publish the repo

```bash
git init
git add .
git commit -m "Initial mobile app for Elmubarak Digital Hub"
git branch -M main
git remote add origin https://github.com/<your-username>/elmubarak-digital-hub.git
git push -u origin main
```

## 4. The "update" Action button

**Actions → Update from Web App & Build → Run workflow.** It:

1. Checks the latest commit on `somboy015c/almubarak`.
2. If there's something new (or you tick "force rebuild"): runs
   `scripts/sync-source.js` to re-pull `login.html`, `register.html`,
   `dashboard.html`, `admin.html`, `css/`, `js/`, `assets/`, bumps the
   Android version code, runs `cap sync`, and builds an APK named
   `Elmubarak-DH.apk`.
3. Commits the freshly-synced files back to this repo, so the repo itself
   always reflects what's actually shipping.
4. Publishes `Elmubarak-DH.apk` to a release tagged `latest-build` (creating
   it the first time, updating it on every run after) — **and also** uploads
   it as a workflow artifact.

### Your permanent download link

Because the release tag (`latest-build`) and the filename (`Elmubarak-DH.apk`)
never change — only the file's contents get replaced on each run — this URL
works forever and always serves the current build:

```
https://github.com/<your-username>/<your-repo>/releases/download/latest-build/Elmubarak-DH.apk
```

Swap in your actual GitHub username and repo name once you've pushed, and
that's the link to put on your website. You don't need to update it again
after future rebuilds.

Also runs daily (edit the `cron` line in
`.github/workflows/update-and-build.yml` to change that).

For a **signed release APK** (Play Store), add these repo secrets and swap
`assembleDebug` for `assembleRelease` in the workflow, decoding the keystore
in a step beforehand:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Assets included

- `assets/icon.png` — 1024×1024 app icon (your logo, white background, green ring)
- `assets/icon-foreground.png` / `icon-background.png` — Android adaptive icon layers
- `assets/splash.png` / `splash-dark.png` — 2732×2732 splash source images

`npx capacitor-assets generate` turns these into every platform size
automatically — re-run it any time you swap these files.

## Extending the bottom nav / bridge to other pages

Right now `native/bridge.js`'s bottom nav is only injected into
`dashboard.html`. To add the same status bar / back-button polish to
`login.html`, `register.html`, or `admin.html`, add them to `TARGET_PAGES` in
`scripts/inject-bridge.js` — the same non-destructive injection applies.

## What I couldn't do from this chat

I don't have network access in this environment, so I couldn't clone
`somboy015c/almubarak` into a real git repo, create the GitHub repo, or push
anything for you — I *could* fetch the public pages via web search/fetch to
read their actual structure (which is how `native/bridge.js` knows the real
`data-view` names), but not run `git clone`. The steps above are exactly what
`scripts/sync-source.js` and the GitHub Action do automatically once this is
pushed. If you'd rather have the whole thing — clone, verify the session key,
build, push, wire up signing secrets — done end-to-end without doing it
yourself, that's a good fit for **Claude Code** (desktop or CLI), which has
real repo and terminal access.
