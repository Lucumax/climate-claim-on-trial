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

// Shared by the case docket and Detective so both rulings look the same.
export const gavelIcon = () => s("svg", { class: "gavel", viewBox: "0 0 48 48", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "2" }, s("g", { transform: "rotate(-38 24 21)" }, s("rect", { x: 11, y: 9, width: 23, height: 12, rx: 2 }), s("path", { d: "M15 9v12m15-12v12M21 21v17h5V21" })), s("path", { d: "M27 40h15v4H27z" }));
export const honestNull = () => h("section", { class: "panel record" }, h("h3", {}, "An honest null belongs here."), h("p", {}, "Not flagged means too little evidence, not no change. A result that is not significant is still a finding and can be reported."), h("div", { class: "evidence-tags" }, h("span", {}, "TRACEABLE"), h("span", {}, "REVISABLE")));
