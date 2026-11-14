// Headline clinic: one compact strip on each case docket (fills #clinic-slot) and the "Who acts on this?" line for the ruling summary.
// Three cells, read left to right: the headline -> what this record can test -> what the evidence supports.
// The third cell is generated from the case's own bundle fields with fixed templates (no hand-written results).
// Headlines and dates are from review/HEADLINES_SOURCED.md (pages fetched Nov 14, 2026). Quotes are the outlet's own titles, 15 words or fewer, and linked.
import { h, pct, signed, U, range } from "../util.js";

// tag: what kind of headline it is. test: what THIS record can and cannot test (one sentence). noun: short name of the measured thing.
const CLINIC = {
  "C-A": { quote: "Can Poor Air Quality Mask Global Warming's Effects?", outlet: "NASA JPL", date: "Aug 7, 2017", url: "https://www.jpl.nasa.gov/news/can-poor-air-quality-mask-global-warmings-effects/",
    tag: "Context only: about air, not land surface", noun: "summer daytime land surface temperature",
    test: p => `Whether summer daytime land surface temperature in ${p.place} changed, ${p.period}. It cannot test air temperature or air quality.`,
    who: "Grid operators and insurers, who plan around summer heat." },
  "C-B": { quote: "A Deluge for the Sahara", outlet: "NASA Earth Observatory", date: "Sep 14, 2024", url: "https://science.nasa.gov/earth/earth-observatory/a-deluge-for-the-sahara-153320",
    tag: "One storm, not a trend", noun: "wet-season rainfall",
    test: p => `Whether wet-season rainfall in ${p.place} changed across ${p.period}. One storm is an event; a trend is the change over many seasons.`,
    who: "Farmers and food-security planners." },
  "C-C": { quote: "Alaska climate report: 2025 ran warm", outlet: "UAF Geophysical Institute", date: "Feb 13, 2026", url: "https://www.gi.alaska.edu/news/alaska-climate-report-2025-ran-warm",
    tag: "One year, not a trend", noun: "yearly air temperature",
    test: p => `Whether yearly air temperature in ${p.place} changed across ${p.n} years. One warm year is a single point in that record.`,
    who: "Engineers and managers of infrastructure on thawing ground." },
  "C-D": { quote: "Wildfire smoke returns to Wisconsin for another summer, DNR issues advisory through Thursday", outlet: "WXPR", date: "Jul 14, 2026", url: "https://www.wxpr.org/health/2026-07-14/wildfire-smoke-returns-to-wisconsin-for-another-summer-dnr-issues-advisory-through-thursday",
    tag: "“Another summer” implies a pattern", noun: "summer haze (aerosol optical depth)",
    test: p => `Whether summer haze seen from space over ${p.place} changed across ${p.period}. That is the pattern “another summer” implies. It is not air quality at ground level.`,
    who: "Public-health teams that issue air-quality alerts." },
};

export const whoActs = c => (CLINIC[c.id] || {}).who || null;

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const pctWhole = f => pct(f, 0);

// Fixed templates, one per verdict branch. Every number comes from the bundle (regional.sen, regional.interval, last hearing, period).
export function supports(c, info) {
  const r = c.regional, u = U(r.units), v = c.verdict, ivl = r.interval, last = c.ladder[c.ladder.length - 1];
  const noun = (info && info.noun) || c.finding.variable.replace(/\s*\(.*?\)/g, ""), S = `${cap(noun)} in ${c.region.name}`, s0 = `${noun} in ${c.region.name}`, per = range(c.period.start, c.period.end);
  const slope = `${signed(r.sen.slope_per_decade, 2)}${u ? " " + u : ""} per decade`, interval = ivl ? ` (nominal 95% interval ${signed(ivl.lo, 2)} to ${signed(ivl.hi, 2)})` : "";
  const share = c.gate.cells && last ? `${pctWhole(last.flagged_fraction_claimed)} of the mapped area is flagged in the claimed direction` : null;
  const dataset = (c.product && c.product.name.replace(/\s*\(.*$/, "").replace(/,.*$/, "")) || "this dataset";
  const lead = txt => h("span", {}, h("b", {}, (v.scoped || v.label) + ". "), txt);
  if (v.branch === "withheld") return h("span", {}, h("b", {}, "This record cannot settle it. "), `Here is what it shows descriptively: ${s0} moved ${slope}, ${per}, with no significance statement. It is a description, not a verdict.`);
  if (v.id === "supported") return lead(`${S} changed by ${slope}, ${per}${interval}, and ${share || "the regional test is significant"}. This is a ${c.period.n}-year trend in one dataset. It does not explain any single year or event, or why it changed.`);
  if (v.id === "partly_supported") return lead(`${S} changed by ${slope}, ${per}${interval}, but ${share ? "only " + share : "the map does not clearly agree"}. A regional average moved; the rest of the map did not clearly show it. It does not describe any single event.`);
  if (v.id === "contradicted") return lead(`${S} moved the other way: ${slope}, ${per}${interval}. This is what ${dataset} shows for this box and period.`);
  return lead(`${S} shows no significant change in the claimed direction, ${per} (${slope}). That is not proof of no change.`);
}

export function clinicStrip(c) {
  const info = CLINIC[c.id];
  if (!info) return null;
  const p = { place: c.region.name, period: range(c.period.start, c.period.end), n: c.period.n };
  const cell = (label, ...kids) => h("div", { class: "strip-cell" }, h("p", { class: "eyebrow" }, label), ...kids);
  return h("section", { class: "strip flow", "aria-labelledby": "clinic-h" },
    h("h2", { id: "clinic-h", class: "sr-only" }, "Headline clinic: from the headline to what the evidence supports"),
    cell("The headline",
      h("p", { class: "strip-quote" }, "“" + info.quote + "”"),
      h("p", { class: "strip-src" }, h("a", { href: info.url, target: "_blank", rel: "noopener noreferrer" }, `${info.outlet}, ${info.date}`, h("span", { class: "sr-only" }, " (opens in a new tab)"))),
      h("span", { class: "chip" }, info.tag)),
    cell("What this data can test", h("p", { class: "strip-text" }, info.test(p))),
    cell("What the evidence supports", h("p", { class: "strip-text" }, supports(c, info))),
    h("p", { class: "strip-note" }, "Headline quoted for context. The outlet has not reviewed or endorsed this analysis."));
}
