// Adds <link>/<script> tags for the native bridge into the freshly-synced
// dashboard.html. It only ever APPENDS tags — your file's own markup,
// styling and logic are never rewritten or removed.

const fs = require("fs");
const path = require("path");

const WWW_DIR = path.join(__dirname, "..", "www");
const TARGET_PAGES = ["dashboard.html"]; // add "login.html", "register.html" here too if you want the same status-bar/back-button polish on those screens

const CSS_TAG = `<link rel="stylesheet" href="native/bridge.css" />`;
const JS_TAG = `<script src="native/bridge.js"></script>`;

for (const page of TARGET_PAGES) {
  const filePath = path.join(WWW_DIR, page);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${page} — not found (did sync-source.js run first?)`);
    continue;
  }

  let html = fs.readFileSync(filePath, "utf8");

  if (html.includes(CSS_TAG) || html.includes(JS_TAG)) {
    console.log(`${page} already has the bridge injected — skipping.`);
    continue;
  }

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${CSS_TAG}\n</head>`);
  } else {
    console.warn(`${page}: no </head> found, appending CSS tag at top of file`);
    html = CSS_TAG + "\n" + html;
  }

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${JS_TAG}\n</body>`);
  } else {
    console.warn(`${page}: no </body> found, appending JS tag at end of file`);
    html += "\n" + JS_TAG;
  }

  fs.writeFileSync(filePath, html);
  console.log(`Injected native bridge into ${page}`);
}
