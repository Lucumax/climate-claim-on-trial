// Monthly-cycle mount point. Prefers the 3D "tornado" spiral (viz/tornado.js, same render/destroy API) when that module exists and starts;
// otherwise falls back to the flat spiral (viz/spiral.js). Callers never import either module directly.
export async function renderCycle(container, data, options = {}) {
  try {
    const mod = await import("./tornado.js");
    if (mod && typeof mod.render === "function") { const hnd = await mod.render(container, data, options); if (hnd) return hnd; }
  } catch (e) { /* tornado.js missing or failed to start: use the flat spiral */ }
  const sp = await import("./spiral.js");
  return sp.render(container, data, options);
}
