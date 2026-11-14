import { h, s } from "../util.js";
import { makeView, basemapLayers } from "../basemap.js";

export const KIND = { satellite_observation: "Satellite observation", model_reanalysis: "Model output (reanalysis), not a direct measurement" };

// Small real-basemap thumbnail of a region (context only, no data).
let thumbId = 0;
export function regionThumb(box, label) {
  const view = makeView(box, { width: 320, maxHeight: 190 }), id = "th" + (thumbId++), bm = basemapLayers(view, { states: true, id });
  return s("svg", { class: "map thumb", viewBox: `0 0 ${view.W.toFixed(0)} ${view.H.toFixed(0)}`, role: "img", "aria-label": label },
    s("defs", {}, bm.defs), bm.under, bm.over, s("g", { class: "bm-frame", "aria-hidden": "true" }, s("rect", { class: "bm-edge", x: view.ML, y: view.MT, width: view.pw, height: view.ph, fill: "none" })));
}

export function withheldNote(c) {
  if (c.verdict.branch !== "withheld" && c.gate.cells && c.gate.interval) return null;
  const why = (c.verdict.withheld_reasons && c.verdict.withheld_reasons.length ? c.verdict.withheld_reasons : c.gate.reasons) || [];
  return h("p", { class: "callout", role: "note" }, h("b", {}, "Some results are withheld. "), "The checks they depend on did not pass", why.length ? ": " + why.join("; ") : "", ". Numbers shown here are for reading only, not a basis for a verdict.");
}

export function tone(v) {
  if (v.tone) return v.tone;
  return { supported: "ok", partly_supported: "warn", contradicted: "bad", not_supported: "neutral" }[v.branch] || "neutral";
}

export const tip = (...kids) => h("div", { class: "tip" }, h("b", {}, "Detective tip"), h("p", {}, ...kids));
