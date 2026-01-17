import { spawnSync } from "node:child_process";

const r = spawnSync("node", [".github/scripts/healthcheck.mjs"], { stdio: "inherit" });
process.exit(r.status ?? 1);
