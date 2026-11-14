import { h, s, boxStr } from "../util.js";

export const KIND = { satellite_observation: "Satellite observation", model_reanalysis: "Model output (reanalysis), not a direct measurement" };

export function caseHeader(claim, active) {
  const base = `#/case/${claim.id}`;
  const steps = [["", "The claim", "claim"], ["/ladder", "The ladder", "ladder"], ["/series", "The series", "series"], ["/verdict", "The finding", "verdict"]];
  return h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/cases" }, "Case files"), " / ", claim.id),
    h("div", { class: "casehead" }, h("span", { class: "chip neutral" }, "Case " + claim.id), h("span", { class: "chip " + (claim.data_kind === "model_reanalysis" ? "warn" : "neutral") }, KIND[claim.data_kind] || claim.data_kind)),
    h("div", { class: "claimbox" }, "“" + claim.claim_text + ".”"),
    h("p", { class: "meta", style: "margin-top:12px" },
      h("span", {}, h("b", {}, "Place: "), claim.region.name, " (", boxStr(claim.region.box), ")"),
      h("span", {}, h("b", {}, "Period: "), claim.season, ", ", String(claim.period.start), " to ", String(claim.period.end)),
      h("span", {}, h("b", {}, "Clue: "), claim.variable.name)),
    h("ol", { class: "path", "aria-label": "Case steps" }, steps.map(([suffix, label, key], i) =>
      h("li", {}, h("a", { href: base + suffix, "aria-current": key === active ? "page" : null }, h("span", { class: "n" }, String(i + 1)), label)))));
}

export function miniBox(box, label) {
  const W = 360, H = 180, x = lon => (lon + 180) / 360 * W, y = lat => (90 - lat) / 180 * H;
  const svg = s("svg", { class: "boxmini", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label },
    s("rect", { class: "frame", x: 0, y: 0, width: W, height: H, rx: 4 }));
  for (const lat of [-60, -30, 0, 30, 60]) svg.append(s("line", { x1: 0, x2: W, y1: y(lat), y2: y(lat), stroke: "var(--line)" }));
  for (const lon of [-120, -60, 0, 60, 120]) svg.append(s("line", { y1: 0, y2: H, x1: x(lon), x2: x(lon), stroke: "var(--line)" }));
  svg.append(s("rect", { class: "hl", x: x(box.w), y: y(box.n), width: Math.max(4, x(box.e) - x(box.w)), height: Math.max(4, y(box.s) - y(box.n)) }));
  return svg;
}

export function tone(v) {
  if (v.tone) return v.tone;
  return { supported: "ok", partly_supported: "warn", contradicted: "bad", not_supported: "neutral" }[v.branch] || "neutral";
}
