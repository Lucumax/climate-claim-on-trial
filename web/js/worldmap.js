// Simple world map for choosing a box. Land outline: Natural Earth 110m (public domain) via world-atlas (ISC), vendored in
// vendor/land-110m.json and decoded here (about 30 lines of TopoJSON decoding, no library). Equirectangular, so a box is a rectangle.
import { h, s } from "./util.js";

let landPath = null;
async function getLandPath() {
  if (landPath) return landPath;
  const topo = await (await fetch("vendor/land-110m.json")).json();
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
  const ring = idxs => { const pts = []; for (const i of idxs) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
  const X = lon => ((lon + 180) * 2).toFixed(1), Y = lat => ((90 - lat) * 2).toFixed(1);
  let d = "";
  for (const g of topo.objects.land.geometries) {
    const polys = g.type === "MultiPolygon" ? g.arcs : [g.arcs];
    for (const poly of polys) for (const r of poly) {
      const p = ring(r); const u = [p[0]]; // unwrap longitudes so rings that cross the antimeridian stay continuous
      for (let i = 1; i < p.length; i++) { let dl = p[i][0] - p[i - 1][0]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; u.push([u[i - 1][0] + dl, p[i][1]]); }
      for (const off of [-360, 0, 360]) d += "M" + u.map(q => X(q[0] + off) + " " + Y(q[1])).join("L") + "Z";
    }
  }
  return (landPath = d);
}

export function worldMap({ box, onChange, label }) {
  const W = 720, H = 360, X = lon => (lon + 180) * 2, Y = lat => (90 - lat) * 2;
  const rect = s("rect", { class: "selbox" });
  const land = s("path", { class: "land" });
  const svg = s("svg", { class: "worldmap", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label || "World map. Use the number boxes below to set the region." },
    s("rect", { class: "ocean", width: W, height: H }), land, rect);
  for (const lat of [-60, -30, 0, 30, 60]) svg.append(s("line", { class: "gl", x1: 0, x2: W, y1: Y(lat), y2: Y(lat) }));
  for (const lon of [-120, -60, 0, 60, 120]) svg.append(s("line", { class: "gl", y1: 0, y2: H, x1: X(lon), x2: X(lon) }));
  svg.insertBefore(land, rect);
  getLandPath().then(d => land.setAttribute("d", d)).catch(() => { /* map outline is a nicety; inputs still work */ });
  function draw(b) {
    rect.setAttribute("x", X(b.w)); rect.setAttribute("y", Y(b.n));
    rect.setAttribute("width", Math.max(5, X(b.e) - X(b.w))); rect.setAttribute("height", Math.max(5, Y(b.s) - Y(b.n)));
  }
  draw(box);
  let start = null;
  const pt = ev => { const r = svg.getBoundingClientRect(); return { lon: Math.min(180, Math.max(-180, (ev.clientX - r.left) / r.width * 360 - 180)), lat: Math.min(90, Math.max(-90, 90 - (ev.clientY - r.top) / r.height * 180)) }; };
  const round = v => Math.round(v * 2) / 2;
  function emit(a, b) { return { s: round(Math.min(a.lat, b.lat)), n: round(Math.max(a.lat, b.lat)), w: round(Math.min(a.lon, b.lon)), e: round(Math.max(a.lon, b.lon)) }; }
  svg.addEventListener("pointerdown", ev => { start = pt(ev); svg.setPointerCapture(ev.pointerId); });
  svg.addEventListener("pointermove", ev => { if (start) draw(emit(start, pt(ev))); });
  svg.addEventListener("pointerup", ev => { if (!start) return; const b = emit(start, pt(ev)); start = null; if (b.n - b.s >= 0.5 && b.e - b.w >= 0.5) { draw(b); onChange(b); } });
  svg.addEventListener("pointercancel", () => { start = null; });
  return { node: svg, setBox: draw };
}
