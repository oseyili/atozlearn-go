import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

const sha = sh("git rev-parse HEAD");
const short = sh("git rev-parse --short HEAD");
const outPath = "src/version.json";
mkdirSync(dirname(outPath), { recursive: true });

writeFileSync(outPath, JSON.stringify({
  sha,
  short,
  builtAt: new Date().toISOString()
}, null, 2));
console.log("AUTO | VERSION | OK | " + short);
