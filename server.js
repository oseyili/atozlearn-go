import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 10000;

// --- HARD PROOF ENDPOINT (bypasses React entirely) ---
const STAMP = "SERVER_PROOF_2026-01-23_02-10-28";
app.get("/proof", (req, res) => {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.status(200).send("OK " + STAMP);
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => console.log("Server listening on " + port));
