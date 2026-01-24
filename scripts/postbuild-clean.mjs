import { rmSync, existsSync } from "node:fs";

const kill = [
  "dist/portal",
  "dist/portal/index.html",
  "dist/portal.html",
  "dist/portal/index.htm",
];

for (const p of kill) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

console.log("[postbuild-clean] removed dist portal pages (SPA routing preserved)");
