// Bumps versionCode in android/app/build.gradle by 1 on every CI build,
// so the Play Store / testers always see each auto-build as a newer version.
const fs = require("fs");
const path = "android/app/build.gradle";

if (!fs.existsSync(path)) {
  console.log(`Skipping version bump — ${path} not found yet (run 'npx cap add android' first).`);
  process.exit(0);
}

let content = fs.readFileSync(path, "utf8");
content = content.replace(/versionCode\s+(\d+)/, (_, n) => `versionCode ${parseInt(n, 10) + 1}`);
fs.writeFileSync(path, content);
console.log("Bumped Android versionCode.");
