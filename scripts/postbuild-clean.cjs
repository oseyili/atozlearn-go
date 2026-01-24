const fs = require("fs");
const path = require("path");

function rm(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}
function copy(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

rm("dist/portal");
rm("dist/portal.html");
rm("dist/portal/index.html");

copy("public/_redirects", "dist/_redirects");

console.log("[postbuild-clean] ok: removed dist/portal* and copied _redirects -> dist/_redirects");
