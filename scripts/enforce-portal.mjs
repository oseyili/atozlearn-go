import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const srcJs = "src/_golden/portal/PortalPage.jsx";
const srcCss = "src/_golden/portal/PortalPage.css";
const outJs = "src/pages/PortalPage.jsx";
const outCss = "src/pages/PortalPage.css";

function copy(from, to){
  if (!existsSync(from)) throw new Error("Missing: " + from);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(from));
}

copy(srcJs, outJs);
copy(srcCss, outCss);

console.log("AUTO | PORTAL | ENFORCE | HEAL | OK");
