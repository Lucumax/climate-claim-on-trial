// Exhibit A: per-cell map. Each cell is drawn at its true latitude/longitude over a real basemap (see basemap.js).
// Categories (colour AND shape, so colour is never the only cue): flagged rising (+), flagged falling (v), not flagged (dot), no data (hatch).
import { h, s, pct, latStr, lonStr, signed, U } from "./util.js";
import { categoryCounts } from "./data.js";
import { makeView, basemapLayers, frameLayer } from "./basemap.js";

export function mapSummary(claim, rung) {
  const g = claim.grid, f = rung.flags, c = categoryCounts(f);
  let t = `Of ${c.n} grid cells with data, ${c.up} (${pct(c.up / c.n)}) are flagged as rising and ${c.down} (${pct(c.down / c.n)}) as falling; ${c.nf} are not flagged.`;
  if (c.up + c.down >= 8) {
    let n = 0, w = 0, tot = 0;
    for (let i = 0; i < g.n_lat; i++) for (let j = 0; j < g.n_lon; j++) { const v = f[i * g.n_lon + j]; if (v) { tot++; if (g.lat[i] >= (claim.region.box.s + claim.region.box.n) / 2) n++; if (g.lon[j] <= (claim.region.box.w + claim.region.box.e) / 2) w++; } }
    const parts = [];
    if (n / tot >= 0.65) parts.push("northern"); else if (n / tot <= 0.35) parts.push("southern");
    if (w / tot >= 0.65) parts.push("western"); else if (w / tot <= 0.35) parts.push("eastern");
    if (parts.length) t += ` Flagged cells sit mostly in the ${parts.join(" and ")} part of the region.`;
  }
  if (c.up + c.down === 0) t = `No cell is flagged on this rung. ${c.n} cells have data.`;
  return t;
}

export function renderMap(claim, rung, opts = {}) {
  const g = claim.grid, nlon = g.n_lon, nlat = g.n_lat, box = claim.region.box;
  const view = opts.view || makeView(box, { width: opts.width || 560, maxHeight: opts.maxHeight || 420 });   // the docket passes the frame it shares with the values-over-time map
  const { X, Y } = view, id = opts.id || "map";
  const dlat = Math.abs(g.dlat), dlon = Math.abs(g.dlon);
  const d = { up: "", down: "", nf: "", nd: "" }, marks = { up: "", down: "", nf: "" };
  const px = Math.abs(X(g.lon[0] + dlon) - X(g.lon[0])), py = Math.abs(Y(g.lat[0]) - Y(g.lat[0] + dlat));
  const showMarks = Math.min(px, py) >= 9;
  for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
    const v = rung.flags[i * nlon + j], x0 = X(g.lon[j] - dlon / 2), x1 = X(g.lon[j] + dlon / 2), y0 = Y(g.lat[i] + dlat / 2), y1 = Y(g.lat[i] - dlat / 2);
    const key = v == null ? "nd" : v > 0 ? "up" : v < 0 ? "down" : "nf";
    d[key] += `M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}z`;
    if (showMarks && key !== "nd") { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.min(x1 - x0, y1 - y0) * 0.22; marks[key] += key === "up" ? `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}h${(2 * r).toFixed(1)}M${cx.toFixed(1)} ${(cy - r).toFixed(1)}v${(2 * r).toFixed(1)}` : key === "down" ? `M${(cx - r).toFixed(1)} ${(cy - r * 0.6).toFixed(1)}l${r.toFixed(1)} ${(r * 1.2).toFixed(1)}l${r.toFixed(1)} ${(-r * 1.2).toFixed(1)}` : `M${(cx - 1).toFixed(1)} ${cy.toFixed(1)}h2`; }
  }
  const bm = basemapLayers(view, { states: true, id });
  const cursor = s("rect", { class: "cursor", visibility: "hidden" });
  const svg = s("svg", { class: "map", viewBox: `0 0 ${view.W.toFixed(0)} ${view.H.toFixed(0)}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" },
    s("defs", {}, bm.defs, s("pattern", { id: id + "-hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, s("line", { class: "hatch-line", x1: 0, y1: 0, x2: 0, y2: 5 }))), bm.under,
    s("g", { "clip-path": `url(#${id}-clip)` }, s("path", { class: "c-nd", d: d.nd }), s("path", { d: d.nd, fill: `url(#${id}-hatch)` }), s("path", { class: "c-nf", d: d.nf }), s("path", { class: "c-down", d: d.down }), s("path", { class: "c-up", d: d.up }),
      s("path", { class: "m-nf", d: marks.nf }), s("path", { class: "m-down", d: marks.down }), s("path", { class: "m-up", d: marks.up })),
    bm.over, frameLayer(view, { label: claim.region.name.replace(/^./, c => c.toUpperCase()) }), cursor);
  const summary = mapSummary(claim, rung);
  const readout = h("div", { class: "readout", "aria-live": "polite" }, "Hover or focus the map and use the arrow keys to read a cell.");
  let cur = null;
  const cellAt = (lat, lon) => ({ i: Math.min(nlat - 1, Math.max(0, Math.round((lat - g.lat[0]) / (g.lat[nlat - 1] - g.lat[0]) * (nlat - 1)))), j: Math.min(nlon - 1, Math.max(0, Math.round((lon - g.lon[0]) / (g.lon[nlon - 1] - g.lon[0]) * (nlon - 1)))) });
  function show(i, j) {
    cur = { i, j };
    cursor.setAttribute("x", X(g.lon[j] - dlon / 2)); cursor.setAttribute("y", Y(g.lat[i] + dlat / 2)); cursor.setAttribute("width", Math.abs(X(g.lon[j] + dlon / 2) - X(g.lon[j] - dlon / 2))); cursor.setAttribute("height", Math.abs(Y(g.lat[i] - dlat / 2) - Y(g.lat[i] + dlat / 2))); cursor.setAttribute("visibility", "visible");
    const idx = i * nlon + j, v = rung.flags[idx], where = `${latStr(g.lat[i])}, ${lonStr(g.lon[j])}`;
    if (v == null) { readout.textContent = `Cell at ${where}: no data (outside the valid area).`; return; }
    const sl = claim.cell_slope_per_decade && claim.cell_slope_per_decade[idx];
    readout.textContent = `Cell at ${where}: ${v > 0 ? "flagged as rising" : v < 0 ? "flagged as falling" : "not flagged"}.` + (sl != null ? ` Sen slope ${signed(sl)} ${U(claim.variable.unit)} per decade.` : "");
  }
  function fromPointer(ev) {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * view.W, vy = (ev.clientY - r.top) / r.height * view.H;
    const lon = view.invX(vx), lat = view.invY(vy);
    if (lon < box.w || lon > box.e || lat < box.s || lat > box.n) return;
    const c = cellAt(lat, lon); show(c.i, c.j);
  }
  svg.addEventListener("pointermove", fromPointer); svg.addEventListener("pointerdown", fromPointer);
  const sumId = id + "-sum";
  const wrap = h("div", { class: "mapfocus", tabindex: "0", role: "group", "aria-label": `${opts.label || "Map for rung " + rung.rung + ": " + rung.label}. Arrow keys move between cells.`, "aria-describedby": sumId }, svg);
  wrap.addEventListener("keydown", ev => {
    const mv = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[ev.key];
    if (!mv) { if (ev.key === "Escape") { cursor.setAttribute("visibility", "hidden"); cur = null; } return; }
    ev.preventDefault();
    const c = cur || { i: Math.floor(nlat / 2), j: Math.floor(nlon / 2) }, sgnLat = g.lat[nlat - 1] >= g.lat[0] ? 1 : -1, sgnLon = g.lon[nlon - 1] >= g.lon[0] ? 1 : -1;
    show(Math.min(nlat - 1, Math.max(0, c.i + (cur ? mv[0] * sgnLat : 0))), Math.min(nlon - 1, Math.max(0, c.j + (cur ? mv[1] * sgnLon : 0))));
  });
  wrap.addEventListener("blur", () => cursor.setAttribute("visibility", "hidden"));
  const node = h("div", { class: "mapwrap" }, wrap, legend(), h("p", { id: sumId, class: "sr-only" }, summary), readout);
  return { node, summary };
}

export function legend() {
  const key = (cls, glyph) => h("span", { class: "key " + cls, "aria-hidden": "true" }, glyph);
  return h("div", { class: "legend", role: "group", "aria-label": "Map key" },
    h("span", { class: "legend-item" }, key("flag", "+"), "Rising, flagged"), h("span", { class: "legend-item" }, key("fall", "⌄"), "Falling, flagged"),
    h("span", { class: "legend-item" }, key("rise", "•"), "Not flagged"), h("span", { class: "legend-item" }, key("none", ""), "No data"));
}
