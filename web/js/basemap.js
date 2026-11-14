// Real basemap drawn as SVG: land, country borders, coastline and (for the United States) state borders, plus a lat/lon frame.
// Data: Natural Earth (public domain) via world-atlas 2.0.2 (ISC) and US state outlines via us-atlas 3.0.1 (ISC), vendored in web/vendor/
// and decoded here (TopoJSON, about 40 lines, no library). Equirectangular projection fitted to the box: x is scaled by cos(mid latitude)
// so shapes keep their true aspect, and every cell is drawn at its real latitude and longitude.
import { s, h } from "./util.js";

const FILES = { c110: "vendor/countries-110m.json", c50: "vendor/countries-50m.json", us: "vendor/us-states-10m.json" };
const loaded = {};

function decode(topo) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
  const ring = idxs => { const pts = []; for (const i of idxs) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]); } return pts; };
  const out = {};
  for (const [name, obj] of Object.entries(topo.objects)) {
    const rings = [];
    const geoms = obj.type === "GeometryCollection" ? obj.geometries : [obj];
    for (const g of geoms) {
      const polys = g.type === "MultiPolygon" ? g.arcs : g.type === "Polygon" ? [g.arcs] : [];
      for (const poly of polys) for (const r of poly) { const pts = ring(r); let w = 1e9, e = -1e9, so = 1e9, n = -1e9; for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < so) so = p[1]; if (p[1] > n) n = p[1]; } rings.push({ pts, bb: [w, so, e, n] }); }
    }
    out[name] = rings;
  }
  return out;
}
export function loadAtlas(key) {
  if (!loaded[key]) loaded[key] = fetch(FILES[key]).then(r => { if (!r.ok) throw new Error(FILES[key]); return r.json(); }).then(decode);
  return loaded[key];
}

const nice = (span, maxTicks) => { for (const st of [0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 45]) if (span / st <= maxTicks) return st; return 60; };
const fmtLat = v => Math.abs(v) + "°" + (v < 0 ? "S" : v > 0 ? "N" : "");
const fmtLon = v => Math.abs(v) + "°" + (v < 0 ? "W" : v > 0 ? "E" : "");

// Fit the box into a plot rectangle. Returns the projection and the outer SVG size (margins hold the tick labels).
export function makeView(box, opts = {}) {
  const maxW = opts.width || 520, maxH = opts.maxHeight || 400, ML = 46, MR = 14, MT = 16, MB = 30;
  const k = Math.max(0.2, Math.cos(((box.s + box.n) / 2) * Math.PI / 180));
  let pw = maxW, ph = pw * (box.n - box.s) / ((box.e - box.w) * k);
  if (ph > maxH) { ph = maxH; pw = ph * (box.e - box.w) * k / (box.n - box.s); }
  const X = lon => ML + (lon - box.w) / (box.e - box.w) * pw, Y = lat => MT + (box.n - lat) / (box.n - box.s) * ph;
  const kmPerDegLon = 111.32 * Math.cos(((box.s + box.n) / 2) * Math.PI / 180);
  return { box, pw, ph, ML, MT, MR, MB, W: ML + pw + MR, H: MT + ph + MB, X, Y, k, kmPerDegLon, invX: px => box.w + (px - ML) / pw * (box.e - box.w), invY: py => box.n - (py - MT) / ph * (box.n - box.s) };
}

function pathFrom(rings, view, wrapWorld) {
  const { box, X, Y } = view; const pad = 1; let d = "";
  for (const r of rings) {
    const [w, so, e, n] = r.bb;
    if (!wrapWorld && (e < box.w - pad || w > box.e + pad || n < box.s - pad || so > box.n + pad)) continue;
    let pts = r.pts;
    if (wrapWorld) { const u = [pts[0]]; for (let i = 1; i < pts.length; i++) { let dl = pts[i][0] - pts[i - 1][0]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; u.push([u[i - 1][0] + dl, pts[i][1]]); } pts = u; }
    for (const off of wrapWorld ? [-360, 0, 360] : [0]) d += "M" + pts.map(q => X(q[0] + off).toFixed(1) + " " + Y(q[1]).toFixed(1)).join("L") + "Z";
  }
  return d;
}

// Returns { defs, under, over, frame }: groups to insert below (ocean, land, borders) and above (coast, states, frame) the data cells.
// Paths fill in asynchronously, so callers can build the map immediately.
export function basemapLayers(view, { states = false, id = "bm" } = {}) {
  const { box } = view, world = box.e - box.w > 300;
  const detail = box.e - box.w > 60 ? "c110" : "c50";
  const clip = s("clipPath", { id: id + "-clip" }, s("rect", { x: view.ML, y: view.MT, width: view.pw, height: view.ph }));
  const ocean = s("rect", { class: "bm-ocean", x: view.ML, y: view.MT, width: view.pw, height: view.ph });
  const land = s("path", { class: "bm-land" }), borders = s("path", { class: "bm-border" });
  const under = s("g", { "clip-path": `url(#${id}-clip)`, "aria-hidden": "true" }, ocean, land, borders);
  const coast = s("path", { class: "bm-coast" }), st = s("path", { class: "bm-state" });
  const over = s("g", { "clip-path": `url(#${id}-clip)`, "aria-hidden": "true" }, coast, st);
  loadAtlas(detail).then(a => { land.setAttribute("d", pathFrom(a.land, view, world)); borders.setAttribute("d", pathFrom(a.countries, view, world)); coast.setAttribute("d", pathFrom(a.land, view, world)); }).catch(() => { /* the basemap is context; the data still draws */ });
  if (states && box.e > -180 && box.w < -60 && box.n > 24 && box.s < 72) loadAtlas("us").then(a => st.setAttribute("d", pathFrom(a.states, view, false))).catch(() => {});
  return { defs: clip, under, over };
}

// Frame, lat/lon ticks, north arrow, scale bar and a neutral place label.
export function frameLayer(view, { label, scaleBar = true, north = true } = {}) {
  const { box, ML, MT, pw, ph, X, Y } = view, g = s("g", { class: "bm-frame", "aria-hidden": "true" });
  g.append(s("rect", { class: "bm-edge", x: ML, y: MT, width: pw, height: ph, fill: "none" }));
  const sl = nice(box.n - box.s, 5), so = nice(box.e - box.w, 7);
  for (let v = Math.ceil(box.s / sl) * sl; v <= box.n + 1e-9; v += sl) { const y = Y(v); if (y < MT + 2 || y > MT + ph - 2) continue; g.append(s("line", { class: "bm-tick", x1: ML - 4, x2: ML, y1: y, y2: y }), s("text", { class: "bm-tl", x: ML - 7, y: y + 4, "text-anchor": "end" }, fmtLat(+v.toFixed(3)))); }
  for (let v = Math.ceil(box.w / so) * so; v <= box.e + 1e-9; v += so) { const x = X(v); if (x < ML + 6 || x > ML + pw - 6) continue; g.append(s("line", { class: "bm-tick", x1: x, x2: x, y1: MT + ph, y2: MT + ph + 4 }), s("text", { class: "bm-tl", x, y: MT + ph + 16, "text-anchor": "middle" }, fmtLon(+v.toFixed(3)))); }
  if (label) g.append(s("text", { class: "bm-place", x: ML + 8, y: MT + 18 }, label));
  if (north) { const x = ML + pw - 16, y = MT + 14; g.append(s("path", { class: "bm-north", d: `M${x} ${y + 20}V${y}m-4 6 4-6 4 6` }), s("text", { class: "bm-tl", x, y: y + 34, "text-anchor": "middle" }, "N")); }
  if (scaleBar) {
    const maxKm = (box.e - box.w) / 4 * view.kmPerDegLon, steps = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000], km = [...steps].reverse().find(v => v <= maxKm) || steps[0];
    const len = km / view.kmPerDegLon * (pw / (box.e - box.w)), x0 = ML + 10, y0 = MT + ph - 12;
    g.append(s("path", { class: "bm-scale", d: `M${x0} ${y0 - 4}V${y0}H${x0 + len}V${y0 - 4}` }), s("text", { class: "bm-tl", x: x0, y: y0 - 7 }, km + " km"));
  }
  return g;
}

export const basemapNote = "Cells are drawn at their true latitude and longitude on a flat map (equirectangular, stretched by the cosine of the middle latitude). Coastlines and borders: Natural Earth; US states: US Census outlines via us-atlas.";
export const basemapNoteEl = () => h("p", { class: "muted small" }, basemapNote);
