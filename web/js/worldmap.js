// Region picker: the same real basemap as the case maps (Natural Earth coastlines and country borders), whole world, drag a box.
import { s } from "./util.js";
import { makeView, basemapLayers, frameLayer } from "./basemap.js";

export function worldMap({ box, onChange, label }) {
  const view = makeView({ s: -90, n: 90, w: -180, e: 180 }, { width: 760, maxHeight: 400 }), { X, Y } = view;
  const bm = basemapLayers(view, { states: false, id: "pick" });
  const rect = s("rect", { class: "selbox" });
  const svg = s("svg", { class: "map worldmap", viewBox: `0 0 ${view.W.toFixed(0)} ${view.H.toFixed(0)}`, role: "img", "aria-label": label || "World map. Drag to draw a box, or use the number boxes and the preset list." },
    s("defs", {}, bm.defs), bm.under, bm.over, frameLayer(view, { scaleBar: false, north: false }), rect);
  function draw(b) {
    rect.setAttribute("x", X(b.w)); rect.setAttribute("y", Y(b.n));
    rect.setAttribute("width", Math.max(5, X(b.e) - X(b.w))); rect.setAttribute("height", Math.max(5, Y(b.s) - Y(b.n)));
  }
  draw(box);
  let start = null;
  const pt = ev => { const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * view.W, vy = (ev.clientY - r.top) / r.height * view.H; return { lon: Math.min(180, Math.max(-180, view.invX(vx))), lat: Math.min(90, Math.max(-90, view.invY(vy))) }; };
  const round = v => Math.round(v * 2) / 2;
  const emit = (a, b) => ({ s: round(Math.min(a.lat, b.lat)), n: round(Math.max(a.lat, b.lat)), w: round(Math.min(a.lon, b.lon)), e: round(Math.max(a.lon, b.lon)) });
  svg.addEventListener("pointerdown", ev => { start = pt(ev); svg.setPointerCapture(ev.pointerId); });
  svg.addEventListener("pointermove", ev => { if (start) draw(emit(start, pt(ev))); });
  svg.addEventListener("pointerup", ev => { if (!start) return; const b = emit(start, pt(ev)); start = null; if (b.n - b.s >= 0.5 && b.e - b.w >= 0.5) { draw(b); onChange(b); } });
  svg.addEventListener("pointercancel", () => { start = null; });
  return { node: svg, setBox: draw };
}
