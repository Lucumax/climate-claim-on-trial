import { h, s, download, announce } from "../util.js";
import { makeView, basemapLayers } from "../basemap.js";

export const KIND = { satellite_observation: "Satellite observation", model_reanalysis: "Model output (reanalysis), not a direct measurement" };

// Small real-basemap locator (shown at 160 x 120): the region box outlined inside a wider view, so a reader can tell where on Earth it is.
let thumbId = 0;
export function regionThumb(box, label) {
  const dLat = box.n - box.s, dLon = box.e - box.w, padLat = Math.max(6, dLat * 0.9), padLon = Math.max(10, dLon * 0.9);
  const wide = { s: Math.max(-85, box.s - padLat), n: Math.min(85, box.n + padLat), w: Math.max(-180, box.w - padLon), e: Math.min(180, box.e + padLon) };
  const view = makeView(wide, { width: 300, maxHeight: 170 }), id = "th" + (thumbId++), bm = basemapLayers(view, { states: false, id });
  return s("svg", { class: "map thumb", viewBox: `0 0 ${view.W.toFixed(0)} ${view.H.toFixed(0)}`, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": label },
    s("defs", {}, bm.defs), bm.under, bm.over, s("g", { class: "bm-frame", "aria-hidden": "true" }, s("rect", { class: "bm-edge", x: view.ML, y: view.MT, width: view.pw, height: view.ph, fill: "none" }),
      s("rect", { class: "selbox", x: view.X(box.w), y: view.Y(box.n), width: view.X(box.e) - view.X(box.w), height: view.Y(box.s) - view.Y(box.n) })));
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

// Shared by the case docket and Investigate so both rulings look the same.
export const gavelIcon = () => s("svg", { class: "gavel", viewBox: "0 0 48 48", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "2" }, s("g", { transform: "rotate(-38 24 21)" }, s("rect", { x: 11, y: 9, width: 23, height: 12, rx: 2 }), s("path", { d: "M15 9v12m15-12v12M21 21v17h5V21" })), s("path", { d: "M27 40h15v4H27z" }));

// Copy button with a visible and a spoken confirmation. Falls back to a text download when the clipboard is blocked.
export function copyButton(label, getText, filename) {
  const msg = h("span", { class: "copied", role: "status", "aria-live": "polite" });
  const btn = h("button", { class: "btn-quiet", type: "button", onclick: () => {
    const text = getText();
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => { msg.textContent = "Copied to the clipboard."; announce("Finding copied to the clipboard."); setTimeout(() => { msg.textContent = ""; }, 3000); },
      () => { download(filename, text, "text/plain"); msg.textContent = "Clipboard blocked, so the finding was downloaded as a text file."; });
  } }, label);
  return h("span", { class: "chips" }, btn, msg);
}

// Placeholder for the Headline clinic strip (another worker fills it). Empty slots are hidden by CSS (.clinic-slot:empty).
export const clinicSlot = (caseId) => h("div", { class: "clinic-slot", id: "clinic-slot", "data-case": caseId });

// Neutral provenance chips: what kind of data this is, never a warning colour.
export const kindChip = kind => h("span", { class: "chip" }, kind === "model_reanalysis" ? "Model-based data" : "Satellite observation");

export const disc = (title, ...kids) => h("details", { class: "disc" }, h("summary", {}, title), h("div", { class: "disc-body" }, ...kids));

// Short dataset name for one-line scopes: the product behind a case, without the catalogue boilerplate.
export function datasetName(c) {
  const n = (c.product && c.product.name) || "";
  if (/MERRA-2/.test(n)) return "MERRA-2 (NASA POWER)";
  if (/IMERG/.test(n)) return "GPM IMERG Final Run, version " + c.product.version;
  return n.replace(/\s*\(.*$/, "").replace(/,.*$/, "") || n;
}
