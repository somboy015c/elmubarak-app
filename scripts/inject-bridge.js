// Adds the app-only <link>/<script> tags to the freshly-synced pages. It only
// ever APPENDS tags: your files' own markup, styling and logic are never changed.

const fs = require("fs");
const path = require("path");

const WWW_DIR = path.join(__dirname, "..", "www");
const css = (f) => `<link rel="stylesheet" href="native/${f}" />`;
const js = (f) => `<script src="native/${f}"></script>`;

const PAGES = {
  "dashboard.html": { head: [css("app.css"), css("bridge.css"), css("quick-login.css")], body: [js("bridge.js"), js("quick-login.js")] },
  "login.html": { head: [css("app.css")], body: [js("quick-login.js")] },
  "register.html": { head: [css("app.css")], body: [] },
  "forgot-password.html": { head: [css("app.css")], body: [] },
  "reset-password.html": { head: [css("app.css")], body: [] },
  "verify-email.html": { head: [css("app.css")], body: [] }
};

for (const [page, tags] of Object.entries(PAGES)) {
  const filePath = path.join(WWW_DIR, page);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${page} (not found; did sync-source.js run first?)`);
    continue;
  }
  let html = fs.readFileSync(filePath, "utf8");
  for (const tag of tags.head) if (!html.includes(tag)) html = html.replace("</head>", `${tag}\n</head>`);
  for (const tag of tags.body) if (!html.includes(tag)) html = html.replace("</body>", `${tag}\n</body>`);
  fs.writeFileSync(filePath, html);
  console.log(`Native tags are in ${page}`);
}
