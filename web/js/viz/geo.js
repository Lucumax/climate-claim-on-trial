// Coastlines and borders for the visual modules: decodes the vendored TopoJSON (world-atlas 2.0.2 from Natural Earth, us-atlas 3.0.1)
// into rings of [lon, lat]. About 30 lines, no library. Cached per page.
import { WEB } from "./common.js";

const FILES = { world: "vendor/countries-50m.json", us: "vendor/us-states-10m.json" };
const cache = {};

function decode(topo) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
  const ring = (idxs) => { const pts = []; for (const i of idxs) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]); } return pts; };
  const out = {};
  for (const [name, obj] of Object.entries(topo.objects)) {
    const rings = [];
    for (const g of obj.type === "GeometryCollection" ? obj.geometries : [obj]) {
      const polys = g.type === "MultiPolygon" ? g.arcs : g.type === "Polygon" ? [g.arcs] : [];
      for (const poly of polys) for (const r of poly) {
        const pts = ring(r); let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
        for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
        rings.push({ pts, bb: [w, s, e, n], name: (g.properties && g.properties.name) || null });
      }
    }
    out[name] = rings;
  }
  return out;
}

/** Resolves to {land, countries, states} ring lists ({pts, bb:[w,s,e,n]}). states is only fetched when asked. */
export function loadGeo({ states = false } = {}) {
  const get = (key) => (cache[key] = cache[key] || fetch(WEB + FILES[key]).then((r) => { if (!r.ok) throw new Error("map data " + FILES[key]); return r.json(); }).then(decode));
  return Promise.all([get("world"), states ? get("us") : null]).then(([w, u]) => ({ land: w.land, countries: w.countries, states: u ? u.states : [] }));
}

export const intersects = (bb, box, pad = 0) => !(bb[2] < box.w - pad || bb[0] > box.e + pad || bb[3] < box.s - pad || bb[1] > box.n + pad);

/** Adds the rings to a path (ctx or Path2D) with the given projection functions. Lines that cross the antimeridian are broken there. */
export function tracePath(path, rings, X, Y, box, pad = 1) {
  for (const r of rings) {
    if (box && !intersects(r.bb, box, pad)) continue;
    const p = r.pts;
    path.moveTo(X(p[0][0]), Y(p[0][1]));
    for (let i = 1; i < p.length; i++) {
      if (Math.abs(p[i][0] - p[i - 1][0]) > 180) path.moveTo(X(p[i][0]), Y(p[i][1]));   // crosses the antimeridian: break the line
      else path.lineTo(X(p[i][0]), Y(p[i][1]));
    }
  }
}

/** True if the case region touches the contiguous United States (then state outlines are drawn). */
export const isUS = (box) => box.s > 20 && box.n < 52 && box.w > -128 && box.e < -64;
