// Grid-cell map drawn as SVG paths (three paths per map, one per category). No tile server, no map library.
import { h, s, pct, latStr, lonStr, signed } from "./util.js";
import { categoryCounts } from "./data.js";

export function mapSummary(claim, rung) {
  const g = claim.grid, f = rung.flags, c = categoryCounts(f);
  const dirWord = claim.direction === "increase" ? "increasing" : "decreasing";
  let t = `Of ${c.n} grid cells with data, ${c.up} (${pct(c.up / c.n)}) are flagged as increasing and ${c.down} (${pct(c.down / c.n)}) as decreasing; ${c.nf} are not flagged.`;
  if (c.up + c.down >= 8) { // where do flagged cells sit?
    let n = 0, w = 0, tot = 0;
    for (let i = 0; i < g.n_lat; i++) for (let j = 0; j < g.n_lon; j++) { const v = f[i * g.n_lon + j]; if (v) { tot++; if (i >= g.n_lat / 2) n++; if (j < g.n_lon / 2) w++; } }
    const parts = [];
    if (n / tot >= 0.65) parts.push("northern"); else if (n / tot <= 0.35) parts.push("southern");
    if (w / tot >= 0.65) parts.push("western"); else if (w / tot <= 0.35) parts.push("eastern");
    if (parts.length) t += ` Flagged cells sit mostly in the ${parts.join(" and ")} part of the box.`;
  }
  if (c.up + c.down === 0) t = `No cell is flagged on this rung. ${c.n} cells have data.`;
  return t;
}

export function renderMap(claim, rung, opts = {}) {
  const g = claim.grid, nlat = g.n_lat, nlon = g.n_lon;
  const mid = (claim.region.box.s + claim.region.box.n) / 2;
  const aspect = Math.cos(mid * Math.PI / 180);
  const cw = g.dlon * aspect, ch = g.dlat;
  const k = 520 / (nlon * cw), CW = cw * k, CH = ch * k;
  const W = nlon * CW, H = nlat * CH;
  const d = { up: [], down: [], nf: [], nd: [] };
  for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
    const v = rung.flags[i * nlon + j];
    const key = v == null ? "nd" : v > 0 ? "up" : v < 0 ? "down" : "nf";
    d[key].push(`M${(j * CW).toFixed(2)} ${((nlat - 1 - i) * CH).toFixed(2)}h${CW.toFixed(2)}v${CH.toFixed(2)}h${(-CW).toFixed(2)}z`);
  }
  const cursor = s("rect", { class: "cursor", width: CW, height: CH, visibility: "hidden" });
  const svg = s("svg", { class: "map", viewBox: `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" },
    s("path", { class: "c-nd", d: d.nd.join("") }), s("path", { class: "c-nf", d: d.nf.join("") }),
    s("path", { class: "c-down", d: d.down.join("") }), s("path", { class: "c-up", d: d.up.join("") }),
    s("rect", { class: "frame", width: W, height: H }), cursor);
  const summary = mapSummary(claim, rung);
  const readout = h("div", { class: "readout", "aria-live": "polite" }, "Hover or focus the map and use the arrow keys to read a cell.");
  let cur = null;
  function show(i, j) {
    cur = { i, j };
    cursor.setAttribute("x", j * CW); cursor.setAttribute("y", (nlat - 1 - i) * CH); cursor.setAttribute("visibility", "visible");
    const idx = i * nlon + j, v = rung.flags[idx];
    const where = `${latStr(g.lat[i])}, ${lonStr(g.lon[j])}`;
    if (v == null) { readout.textContent = `Cell at ${where}: no data (outside the valid area).`; return; }
    const sl = claim.cell_slope_per_decade && claim.cell_slope_per_decade[idx];
    const st = v > 0 ? "flagged as increasing" : v < 0 ? "flagged as decreasing" : "not flagged";
    readout.textContent = `Cell at ${where}: ${st}.` + (sl != null ? ` Sen slope ${signed(sl)} ${claim.variable.unit} per decade.` : "");
  }
  function fromPointer(ev) {
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    const j = Math.min(nlon - 1, Math.max(0, Math.floor(x * nlon))), i = Math.min(nlat - 1, Math.max(0, nlat - 1 - Math.floor(y * nlat)));
    show(i, j);
  }
  svg.addEventListener("pointermove", fromPointer);
  svg.addEventListener("pointerdown", fromPointer);
  const sumId = (opts.id || "map") + "-sum";
  const wrap = h("div", { class: "mapfocus", tabindex: "0", role: "group", "aria-label": `Map, rung ${rung.rung}: ${rung.label}. Arrow keys move between cells.`, "aria-describedby": sumId }, svg);
  wrap.addEventListener("keydown", ev => {
    const key = ev.key; const mv = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[key];
    if (!mv) { if (key === "Escape") { cursor.setAttribute("visibility", "hidden"); cur = null; } return; }
    ev.preventDefault();
    const c = cur || { i: Math.floor(nlat / 2), j: Math.floor(nlon / 2) };
    show(Math.min(nlat - 1, Math.max(0, c.i + (cur ? mv[0] : 0))), Math.min(nlon - 1, Math.max(0, c.j + (cur ? mv[1] : 0))));
  });
  wrap.addEventListener("blur", () => { cursor.setAttribute("visibility", "hidden"); });
  const b = claim.region.box;
  const edges = h("div", { class: "muted small", style: "display:flex;justify-content:space-between;margin-top:4px", "aria-hidden": "true" },
    h("span", {}, `${lonStr(b.w)}`), h("span", {}, `${latStr(b.s)} to ${latStr(b.n)}`), h("span", {}, `${lonStr(b.e)}`));
  const node = h("div", { class: "mapwrap" }, wrap, edges, h("p", { id: sumId, class: "mapsum" }, summary), readout);
  return { node, summary };
}

export function legend(claim) {
  return h("div", { class: "legend", "aria-label": "Map key" },
    h("span", {}, h("i", { class: "up" }), "Flagged: increasing"), h("span", {}, h("i", { class: "down" }), "Flagged: decreasing"),
    h("span", {}, h("i", { class: "nf" }), "Not flagged"), h("span", {}, h("i", { class: "nd" }), "No data"));
}
