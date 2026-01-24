export function installRuntimeOverlay(stamp) {
  function box() {
    let el = document.getElementById("__runtime_error_overlay__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__runtime_error_overlay__";
      el.style.cssText = [
        "position:fixed","inset:12px","z-index:99999","padding:14px 16px",
        "border-radius:16px","border:1px solid rgba(255,80,80,0.35)",
        "background:rgba(20,0,0,0.78)","color:#ffe6e6",
        "font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        "font-size:12px","line-height:1.35","white-space:pre-wrap",
        "overflow:auto","box-shadow:0 20px 80px rgba(0,0,0,0.6)"
      ].join(";");
      document.body.appendChild(el);
    }
    return el;
  }
  function show(title, detail) {
    const el = box();
    el.textContent = `[${stamp}] ${title}\n\n${detail}`;
  }
  window.addEventListener("error", (e) => show("Runtime Error", String(e?.error?.stack || e?.message || e)));
  window.addEventListener("unhandledrejection", (e) => show("Unhandled Promise Rejection", String(e?.reason?.stack || e?.reason || e)));
}
