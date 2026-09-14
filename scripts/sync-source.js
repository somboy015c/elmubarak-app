// Pulls the latest version of your web app (somboy015c/almubarak) straight
// into www/, so the mobile app always ships the exact same HTML/CSS/JS you
// deploy to GitHub Pages — nothing here is rewritten, only added alongside.
//
// Run manually any time with:   node scripts/sync-source.js
// The GitHub Action runs this automatically before every build.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SOURCE_REPO = "https://github.com/somboy015c/almubarak.git";
const SOURCE_BRANCH = "main";
const WWW_DIR = path.join(__dirname, "..", "www");

// Files/folders copied as-is from the source repo. index.html is deliberately
// EXCLUDED — that's your marketing landing page, and the mobile app's own
// splash/onboarding index.html replaces it as the entry point.
const INCLUDE = ["login.html", "register.html", "dashboard.html", "admin.html", "css", "js", "assets"];

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "almubarak-src-"));
  console.log(`Cloning ${SOURCE_REPO} (${SOURCE_BRANCH}) into ${tmp} ...`);
  run(`git clone --depth 1 --branch ${SOURCE_BRANCH} ${SOURCE_REPO} .`, tmp);

  for (const item of INCLUDE) {
    const src = path.join(tmp, item);
    const dest = path.join(WWW_DIR, item);
    if (!fs.existsSync(src)) {
      console.log(`Skipping ${item} (not found in source repo)`);
      continue;
    }
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyRecursive(src, dest);
    console.log(`Synced ${item}`);
  }

  // Your assets/icon.png etc. from the app shell take priority over the
  // source repo's own assets/ for the app icon itself — restore ours after
  // the copy so the native app icon stays the branded one we generated.
  const shellIcon = path.join(__dirname, "..", "assets", "icon.png");
  const shellSplash = path.join(__dirname, "..", "assets", "splash.png");
  if (fs.existsSync(shellIcon)) fs.copyFileSync(shellIcon, path.join(WWW_DIR, "assets", "icon.png"));
  if (fs.existsSync(shellSplash)) fs.copyFileSync(shellSplash, path.join(WWW_DIR, "assets", "splash.png"));

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("\nRunning bridge injection...");
  run("node scripts/inject-bridge.js", path.join(__dirname, ".."));

  console.log("\nDone. Run `npx cap sync` next.");
}

main();
