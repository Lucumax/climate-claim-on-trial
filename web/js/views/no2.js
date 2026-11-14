// Plain-English docket copy for the registered NO2 pair (C-E1 eastern US, claim "has fallen"; C-E2 Indo-Gangetic Plain, claim "has risen").
// Both rulings are WITHHELD by the registered validation gate (WP0 addendum 3 and addendum 4, "no further gate changes before submission").
// Nothing here is a result: every number is read from the case bundle (c.*), and the words only describe what the bundle already says.
import { h, signed, fmtNum, U } from "../util.js";

const DOI = "10.5067/AURA/OMI/DATA3407";
const AURA_URL = "https://science.nasa.gov/missions/potential-evolution-of-the-aura-mission";   // opens (HTTP 200, checked Nov 14, 2026); source notes: review/data_qa/AURA_DRIFT_SOURCES.md
const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text, h("span", { class: "sr-only" }, " (opens in a new tab)"));

// What the yearly series does, in the bundle's own numbers (value against the record's own 2005-2025 average).
const at = (c, y) => { const i = c.regional.years.indexOf(y); return i < 0 ? null : c.regional.anomaly[i]; };
const sg = v => signed(v, 2);

function shape(c) {
  const a = y => at(c, y);
  if (c.id === "C-E1") {
    const later = c.regional.years.map((y, i) => [y, c.regional.anomaly[i]]).filter(([y, v]) => y >= 2013 && v != null).map(([, v]) => v);
    const low = Math.min(...later), lowYear = c.regional.years[c.regional.anomaly.indexOf(low)];
    return `The record fell fast from 2005 to about 2012 (from ${sg(a(2005))} to ${sg(a(2012))}) and then flattened: from 2013 to 2025 it only varied between ${sg(Math.max(...later))} and ${sg(low)} (lowest in ${lowYear}, ${sg(a(2025))} in 2025).`;
  }
  return `The record did not climb along a line: it went from ${sg(a(2005))} in 2005 to ${sg(a(2015))} in 2015, jumped to ${sg(a(2016))} in 2016, dipped to ${sg(a(2020))} in 2020 and reached ${sg(a(2025))} by 2025.`;
}

// Numbers that only exist as text in the bundle (the gate's reason and the adaptive display line).
const yw = c => { const m = /Yue-Wang ([\d.]+)%/.exec((c.verdict.withheld_reasons || []).join(" ")); return m ? m[1] : null; };
const adaptive = c => {
  const t = (c.display && c.display.falsePositive) || "";
  const m = /received a verdict, at this setting: ([\d.]+)% \(overall ([\d.]+)%\)/.exec(t), n = /([\d,]+) of ([\d,]+) trendless simulated records received a verdict/.exec(t);
  return m ? { released: m[1], overall: m[2], rel: n ? n[1] : null, all: n ? n[2] : null } : null;
};
const lastHearing = c => c.ladder[c.ladder.length - 1];
const hearingRange = c => {
  const f = c.ladder.map(q => q.flagged_fraction_claimed * 100);
  return `${Math.round(Math.min(...f))}% to ${Math.round(Math.max(...f))}%`;
};

const MEMORY = "Year-to-year memory is how much each year's value resembles the year before once the straight line has been taken out. Zero means none; one means each year is a copy of the last.";

// One short sentence for the ruling summary (replaces the generic "Why: ..." line).
export function plainReason(c) {
  const phi = c.phi_hat != null ? fmtNum(c.phi_hat, 2) : "n/a";
  if (c.id === "C-E1") return `A straight line leaves too much year-to-year memory in this record (${phi}, above the 0.6 we tested), so at 21 years none of our validated tests applies. The record did not pass our validation checks, so we withhold the ruling.`;
  return `A straight line leaves year-to-year memory of ${phi} in this record, and at 21 years every test we validated raises too many false alarms at that level. The record did not pass our validation checks, so we withhold the ruling.`;
}

export const hasNote = c => c.id === "C-E1" || c.id === "C-E2";

// The explainer shown right under the ruling.
export function whyBlock(c) {
  const u = U(c.regional.units), phi = c.phi_hat != null ? fmtNum(c.phi_hat, 2) : "n/a", slope = `${signed(c.regional.sen.slope_per_decade, 2)} ${u} per decade`;
  const e1 = c.id === "C-E1", claimed = e1 ? "fallen" : "risen", other = e1 ? "C-E2" : "C-E1";
  const ad = adaptive(c);
  const paras = [
    h("p", {}, h("b", {}, "What the readings say. "), `The Sen slope is ${slope}. In hearings 1 to ${c.ladder.length}, ${hearingRange(c)} of the mapped area is flagged in the claimed direction (${e1 ? "falling" : "rising"}), a description only. The readings point the way the claim says, in both boxes of this pair. They are not verdicts.`),
    h("p", {}, h("b", {}, "Why the court still does not rule. "), shape(c), ` A straight-line test reads a bend like that as year-to-year "memory". ${MEMORY} Here it is ${phi}.`),
    e1
      ? h("p", {}, `We tested our tests on simulated records with no trend at all, at memory levels up to 0.6. This record is above that (${phi}), so at 21 years none of our candidate tests was validated for this setting. The gate refuses to rule rather than risk a false alarm.`)
      : h("p", {}, `The next memory level up that we tested is 0.45, and at 21 years all seven candidate tests raise too many false alarms there: the best of them, Yue-Wang, called ${yw(c) || "more than 10"}% of trendless records a trend, against a target of 5%.${ad ? ` In the simulation for this setting, a verdict was released for ${ad.rel || "some"} of ${ad.all || "the"} trendless records, and ${ad.released}% of those released verdicts were false alarms (${ad.overall}% overall).` : ""} The gate refuses to rule rather than risk a false alarm.`),
    h("p", {}, h("b", {}, "This is the gate working as designed. "), `A ruling that cannot be calibrated is worse than no ruling. We did not change the gate, the numbers or the question after seeing these results (`, h("a", { href: "#/data/registration" }, "Addendum 4"), ": no further gate changes before submission). A trend shape that allows a bend was not run: it would be a change made after the result, and it would have to be disclosed as one."),
    h("p", {}, h("b", {}, "How this case was registered. "), `We registered two claims as an opposite-sign pair, because both respond to combustion emissions and the controls on them: that NO₂ over the eastern US has fallen (C-E1), and that NO₂ over the Indo-Gangetic Plain has risen (C-E2). We registered the pair at 1:15 PM ET on Saturday, November 14, before any NO₂ data was downloaded (`, h("a", { href: "#/data/registration" }, "Addendum 3"), "). Both came back withheld. ", h("a", { href: `#/case/${other}` }, `See the other half, ${other.replace("-", "–")}`), "."),
  ];
  return h("section", { class: "callout info no2-why", role: "note", "aria-labelledby": "no2-why-h" }, h("h2", { id: "no2-why-h", class: "callout-h" }, "Why the court cannot rule on this record"), ...paras);
}

// Banner above the hearings map: it is shown for reading only.
export const mapBanner = c => h("p", { class: "callout", role: "note" }, h("b", {}, "Unadjusted, descriptive. "), `These flags come from tests that did not pass validation for this record${c.cells_mode === "off" ? " (no cell test was validated at this memory level)" : " (all candidate tests raised too many false alarms at 21 years)"}, so they describe the cells; they are not a finding. Hearing 4, the false-discovery step, is not shown.`);

// The four limits lines, shown under "Limits of this finding".
export function limits(c) {
  return h("div", { class: "no2-limits" },
    h("p", {}, h("b", {}, "OMI row anomaly (since June 2007). "), "Part of OMI's view has been affected by the row anomaly since June 2007. The affected rows are marked as missing and excluded using NASA's own quality flags, so no number here uses them."),
    h("p", {}, h("b", {}, "Aura orbit drift. "), "NASA says Aura's equator-crossing time drifted by under 15 minutes through late 2024 and by about 30 minutes by mid-2025, and calls this minor for OMI data quality (", link(AURA_URL, "NASA, Potential Evolution of the Aura Mission, updated 8 Sep 2026"), "). We found no NASA statement on what it does to tropospheric NO₂ and did not test it. Source notes: review/data_qa/AURA_DRIFT_SOURCES.md in the project repository."),
    h("p", {}, h("b", {}, "Units. "), `Values are in ×10¹⁵ molecules/cm² (a tropospheric column: all the NO₂ in the lower atmosphere above one square centimeter of ground). It is not ground-level air quality: it does not measure the concentration people breathe at ground level.`),
    h("p", {}, h("b", {}, "Provenance. "), `OMI/Aura NO₂ Cloud-Screened Total and Tropospheric Column, Level 3, 0.25 degree grid (OMNO2d, version 004), averaged to monthly and then annual means. DOI `, link(`https://doi.org/${DOI}`, DOI), "."));
}
