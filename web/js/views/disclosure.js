// Post-result disclosure on the case pages (round-3 science review, review/judge_r3/DISCLOSURE_PLAN.md).
// Three pieces, kept short on the page; the long form is on the Method page ("Known limits and the checks made after the results"):
//   briefLimits(c)      two to four plain lines directly under the ruling
//   exploratoryPanel(c) a collapsed panel, filled from data/exploratory.json (post-result exploratory checks; not the registered test)
//   moreLimits(c)       a few extra paragraphs for the collapsed "Limits of this finding" section
// Nothing here changes a ruling or a number. Every number in the panel is read from data/exploratory.json (stats/scripts/exploratory_r3.py,
// logged in event_record/STATS_LOG.md before it was computed); the brief lines quote the same file's results.
import { h, signed, fmtNum, U } from "../util.js";
import { disc } from "./common.js";

export const LABEL = "Exploratory check made after the results. It is not the registered test, and it does not change the ruling.";
let expP = null;
export const loadExploratory = () => expP || (expP = fetch("data/exploratory.json").then(r => (r.ok ? r.json() : null)).catch(() => null));

const pctShare = v => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const pFmt = p => (p == null ? "n/a" : p < 0.001 ? "< 0.001" : p < 0.1 ? p.toFixed(3) : p.toFixed(2));
const MEM = "Year-to-year memory is how much each year's value resembles the year before once a straight line has been removed.";

// ------------------------------------------------------------------ two to four lines under the ruling
const BRIEF = {
  "C-A": [
    "This is a satellite record whose observation time changed. Against station air temperature, MODIS already trails by about 0.5 °C per decade over 2001 to 2020 (p = 0.003), before the orbit drift, so the drift does not explain the whole gap.",
    "The ruling is withheld because our own checks failed, not because the trend is zero.",
  ],
  "C-B": [
    "Significant under both tests we ran: p = 0.030 (first test, plain Mann-Kendall) and p = 0.004 (second test, written after we saw the first results). The first test was already valid, only cautious: the change bought power, not validity.",
    "\"Partly supported\" reflects what a 25-season map can see: in our simulated map settings it finds between 0.7% and 24% of the cells that truly change (under 12% in eight of the ten settings), so a small flagged share does not mean a narrow change.",
    "IMERG blends changing satellite inputs and is adjusted to rain-gauge totals. The station check (CRU) shares many of those gauges, so it is a cross-check, not an independent measurement.",
    "The result holds only if this window's alternating wet and dry years are real. With year-to-year memory of 0.2 or more it is no longer significant (exploratory, below).",
  ],
  "C-C": [
    "This is model output (MERRA-2), not a direct measurement. Station records warm about 0.06 °C per decade slower (difference p = 0.018), and the box includes sea cells.",
    "In simulated trendless series like this one that received a verdict, 7.4% were called significant (4.8% counting withheld ones). That is above the 5% target, so treat the p-value as a little less strong than it looks. In an exploratory check (below), a pattern this strong would still be rare with no trend even at high memory.",
  ],
  "C-D": [
    "Our test is cautious here (it catches 23% of a real rise of the reference size) and the 42-cell map finds almost nothing, so \"not supported\" is not evidence that no rise happened.",
    "Three smoke summers (2021, 2023, 2025) carry the rise in a reviewer's check, and Aqua's later overpass since 2021 is flagged in our library but not removed here. A plain t-test gives p = 0.04; the sensitivity check is not stable.",
  ],
  "C-E1": [
    "Known limit of our gate: it reads a curved trend as year-to-year memory and withholds. In a simulation of a clean curved decline like this one, the gate gave a verdict in 0 of 2,000 runs. That is a weakness of the method, not a finding about NO₂.",
    "A trend this strong would be rare in no-trend series even at memory 0.8 (exploratory, below); the case for the decline rests on outside knowledge of emission controls, not on this series alone.",
  ],
  "C-E2": [
    "Withheld because year-to-year memory is 0.39. A clean curve of this shape would get a verdict in about two runs of three, so the withhold is not explained by this fitted curve alone.",
    "A trend this strong would be rare in no-trend series even at memory 0.8 (exploratory, below).",
  ],
};
const COMMON = "Questions registered; methods amended and disclosed; final gate frozen. Six claims were tested with no adjustment across cases, and we chose well-known claims on purpose.";

export function briefLimits(c) {
  const items = BRIEF[c.id];
  if (!items) return null;
  return h("section", { class: "callout info case-limits", "aria-labelledby": "case-limits-h" },
    h("h2", { id: "case-limits-h", class: "callout-h" }, "Limits in brief"),
    h("ul", {}, items.map(t => h("li", {}, t))),
    h("p", { class: "small muted" }, COMMON, " ", h("a", { href: "#/method/limits" }, "All known limits"), " · ", h("a", { href: "#/data/registration" }, "Registration and amendments")));
}

// ------------------------------------------------------------------ extra paragraphs for the collapsed "Limits of this finding"
export function moreLimits(c) {
  const P = (b, t) => h("p", {}, h("b", {}, b + " "), t);
  const out = [];
  if (c.id === "C-B") {
    out.push(P("IMERG is a blend of changing satellite inputs.", "Its rain estimates come from a changing set of satellite sensors (the TRMM satellite before 2014 and the GPM satellite after it, plus different microwave sensors over the years), and the Final product is adjusted each month to rain-gauge totals from GPCC. A trend in IMERG can partly come from those changes in its inputs. We did not test for that."));
    out.push(P("The station check shares gauges.", "CRU TS is built from weather-station and rain-gauge archives. IMERG Final is also adjusted to gauge totals, and the two share many of the same gauges, so their agreement is partly shared input."));
    out.push(P("How much the result depends on year-to-year memory.", "In 2001 to 2025 wet seasons in the Sahel tend to alternate with dry ones (memory about -0.67). The exploratory panel shows how often a pattern this strong would happen by chance at other levels of memory. Longer records show positive memory, so the result depends on this window's alternation being a real property of the record."));
    out.push(P("Cell memory.", "The map's test was checked at the memory of the regional series (-0.7 and -0.5). The single cells are less negative (the middle cell is near -0.16, and a fifth are above zero), so the 22.3% comes from a test used partly outside the range it was checked at. The first test flagged 15.6%."));
  }
  if (c.id === "C-A") out.push(P("The drift does not explain the whole gap.", "Against station maximum air temperature, MODIS already falls behind by about 0.5 °C per decade over 2001 to 2020 (95% interval +0.24 to +0.90, p = 0.003), before Terra's orbit moved. The drift fits the sharper drop after 2020, but not the earlier gap, which may be a real difference between land surface (skin) temperature and air temperature."));
  if (c.id === "C-C") {
    out.push(P("Alaska is a reanalysis model.", "Station records (CRU TS 4.10, land points only) warm slightly slower than MERRA-2: station minus MERRA-2 is -0.06 °C per decade over 1981 to 2025 (95% interval -0.11 to -0.01, p = 0.018). The MERRA-2 box also includes sea cells. Both rise, and the station trend (+0.36 per decade) overlaps the MERRA-2 interval."));
    out.push(P("False alarms among verdicts that were given.", "In simulated trendless series like Alaska's (45 years, memory about 0.1), 7.4% of those that received a verdict were called significant, against 4.8% when withheld series count as \"no call\". The 5% bar we checked is the overall rate (withheld counted as no call), not the rate among series that got a verdict."));
    out.push(P("Footprint.", "MERRA-2 cells (0.5 by 0.625 degrees) span 59.75 to 70.25 N and 165.3 to 139.7 W, slightly past the registered 60 to 70 N and 165 to 140 W."));
  }
  if (c.id === "C-D") {
    out.push(P("Aqua's drift is flagged in the library, but not removed here.", "The Investigate library marks Aqua haze data after December 2021. This case uses 2003 to 2025, so 2022 to 2025 are in the registered series, including two of its high years (2023 and 2025). A reviewer's check, not part of the registered test: over 2003 to 2021 only, the slope is +0.013 per decade (p 0.62), and without the smoke summers 2021, 2023 and 2025 it is -0.002 (p 0.87). \"Not supported\" holds either way."));
    out.push(P("Footprint.", "The map uses 42 one-degree cells spanning 42 to 48 N and 93 to 86 W. The registered box is 42.5 to 47.1 N and 92.9 to 86.8 W. Cells that are only partly inside the box count in full, and the analyzed area includes parts of Lake Michigan and Lake Superior."));
  }
  if (c.id === "C-E1" || c.id === "C-E2") {
    out.push(P("Known limit: curved trends.", c.id === "C-E1"
      ? "The gate measures year-to-year memory around a straight line, so a trend that bends (steep at first, flatter later) looks like memory and the gate withholds. In a simulation of a clean curved decline shaped like this record, with no memory at all, the gate gave a verdict in 0 of 2,000 runs; with twice the noise in 13%, with four times in 59%. A cleaner signal is less likely to get a verdict."
      : "The northern India series is not curved in this way: a clean curve of its shape with no memory would get a verdict in about 68% of simulated runs, and its own year-to-year memory (0.39) is above what that simulation gives. Its withhold is not explained by this fitted curve alone."));
    if (c.id === "C-E1") out.push(P("Footprint.", "The box (35 to 45 N, 90 to 70 W) includes Atlantic Ocean cells; there is no land mask."));
  }
  return out;
}

// ------------------------------------------------------------------ the exploratory panel (collapsed, data-driven)
const SHIP = { boot_mk_L3: "Mann-Kendall with a bootstrap p-value", yue_wang: "Mann-Kendall with the Yue-Wang correction", mk_independent: "plain Mann-Kendall" };

function table(caption, head, rows) {
  return h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": caption + " (scrolls sideways)" },
    h("table", { class: "data" }, h("caption", { class: "sr-only" }, caption), h("thead", {}, h("tr", {}, head.map(x => h("th", { scope: "col" }, x)))), h("tbody", {}, rows.map(r => h("tr", {}, r.map((x, i) => (i === 0 ? h("th", { scope: "row" }, x) : h("td", {}, x))))))));
}

function build(c, ex) {
  const id = c.id, u = U(c.regional.units), kids = [];
  const sh = ex.shadow && ex.shadow[id], cp = ex.calibrated_p && ex.calibrated_p.cases[id], cm = ex.cell_memory && ex.cell_memory[id];
  kids.push(h("p", { class: "muted small" }, h("b", {}, "Exploratory check made after the results. "), "It is not the registered test, and it does not change the ruling. Logged in the stats log before it was computed."));
  if (sh) {
    const shipped = sh.shipped ? `The ruling above rests on ${SHIP[sh.shipped.method] || sh.shipped.method} (p = ${pFmt(sh.shipped.p)}).` : "The ruling is withheld: the gate allows no test for this record.";
    const agree = sh.shipped ? ` The registered method alone ${sh.registered_p < 0.05 === sh.shipped.p < 0.05 ? "agrees with it" : "would not have agreed with it"} on significance.` : ` Without the gate this test would have called the trend ${sh.registered_p < 0.05 ? "significant" : "not significant"}, which is exactly what the gate refuses to trust here.`;
    kids.push(h("h3", {}, "The registered method alone"));
    kids.push(h("p", {}, `Mann-Kendall with the Hamed-Rao correction (our first registered test, no gate) gives p = ${pFmt(sh.registered_p)} and a Sen slope of ${signed(sh.sen_per_decade, id === "C-D" ? 3 : 2)} ${u} per decade. ${shipped}${agree}`));
  }
  if (cp) {
    const cols = Object.keys(cp.p).sort((a, b) => a - b);
    const note = cm ? ` This record's own memory estimate is ${fmtNum(cm.regional_phi_hat, 2)}.` : "";
    kids.push(h("h3", {}, "If year-to-year memory were different"));
    kids.push(h("p", {}, `If there were no trend, a pattern this strong would show up by chance this often at each level of year-to-year memory (${ex.calibrated_p.R.toLocaleString("en-US")} simulated trendless series per column, simulation error about 0.4 percentage points). ${MEM}${note}`));
    kids.push(table("Chance of a pattern this strong with no trend, by year-to-year memory", ["Memory", ...cols.map(x => (+x < 0 ? "−" + Math.abs(+x) : x))], [["Chance (p)", ...cols.map(k => pFmt(cp.p[k]))]]));
    if (id === "C-B") kids.push(h("p", {}, "Read across: at memory 0.1 or less the result is significant at 5%; at 0.2 or more it is not. The first test (plain Mann-Kendall, p = 0.030) is the same calculation at memory 0."));
    if (id === "C-E1" || id === "C-E2") kids.push(h("p", {}, "Even at memory 0.8 a trend this strong is rare; only at 0.9, close to a random walk, does it stop being rare. The ruling stays withheld."));
  }
  if (cm) {
    const l = cm.cell_lag1, far = cm.median_far_from_buckets;
    kids.push(h("h3", {}, "Memory of the individual cells"));
    kids.push(h("p", {}, `The middle cell's year-to-year memory is ${fmtNum(l.median, 2)} (5th to 95th percentile ${fmtNum(l.p5, 2)} to ${fmtNum(l.p95, 2)}); ${pctShare(l.share_positive)} of cells are above zero. The cell test was checked at ${cm.governing_buckets && cm.governing_buckets.length ? cm.governing_buckets.map(x => fmtNum(x, 1)).join(" and ") : "no level (this record is above the tested range)"}${far ? ", so the map's test is being used partly outside the range it was checked at" : ""}.`));
  }
  if (id === "C-B" && ex.sahel_map) {
    const m = ex.sahel_map;
    kids.push(h("h3", {}, "The map under both tests"));
    const mp = m.map_power ? Object.entries(m.map_power).map(([k, v]) => [k, v.tfpw]).filter(x => x[1] != null) : [];
    const uni = mp.filter(x => !/het/.test(x[0])).map(x => x[1]), het = mp.filter(x => /het/.test(x[0])).map(x => x[1]);
    const power = mp.length && het.length && uni.length
      ? `In ${mp.length} simulated map settings (25 seasons, cells that truly change by the reference amount), the second test finds ${pctShare(Math.min(...uni, ...het))} to ${pctShare(Math.max(...uni, ...het))} of them: ${pctShare(Math.max(...uni))} or less when every cell has the same memory level (0 to −0.7), and ${pctShare(Math.min(...het))} to ${pctShare(Math.max(...het))} in the two settings where memory differs from cell to cell. A low share is not evidence that the change is narrow.`
      : "In our simulations a 25-season map finds only a small share of the cells that truly change, so a low share is not evidence that the change is narrow.";
    kids.push(h("p", {}, `The first test flags ${pctShare(m.round2_hr_all_lags.flagged_area_frac)} of the area, in either direction (${m.round2_hr_all_lags.flagged_cells} cells); the second flags ${pctShare(m.round3_tfpw.flagged_area_frac)} (${m.round3_tfpw.flagged_cells} cells; ${pctShare(m.round3_in_bundle.flagged_in_direction_area_frac)} in the increasing direction, which is the figure in the ruling). ${power}`));
  }
  if (id === "C-E1" && ex.curved_decline_gate && ex.curved_decline_gate.cases["C-E1"]) {
    const cd = ex.curved_decline_gate.cases["C-E1"], n = ex.curved_decline_gate.R, b = cd.by_noise;
    kids.push(h("h3", {}, "A clean curved decline, with no memory at all"));
    kids.push(h("p", {}, `We simulated a curve fitted to this record (steep first, flatter later) plus independent noise and asked the real gate for a verdict. It gave one in ${b.noise_x1.gate_released} of ${n.toLocaleString("en-US")} runs. With twice the noise: ${pctShare(b.noise_x2.gate_released_share)}. With four times the noise: ${pctShare(b.noise_x4.gate_released_share)}. A cleaner signal is less likely to get a verdict. This is a known limit of the gate, not a finding about the record.`));
  }
  if (id === "C-E2" && ex.curved_decline_gate && ex.curved_decline_gate.cases["C-E2"]) {
    const cd = ex.curved_decline_gate.cases["C-E2"], n = ex.curved_decline_gate.R;
    kids.push(h("h3", {}, "A clean curve of this record's shape"));
    kids.push(h("p", {}, `The same simulation for this record gave a verdict in ${cd.by_noise.noise_x1.gate_released} of ${n.toLocaleString("en-US")} runs, and this record's own memory (${fmtNum(cd.real_series_lag1, 2)}) is above what the simulation gives. So the withhold is not explained by this fitted curve alone.`));
  }
  if (ex.witness_differences && id === "C-A") {
    const w = ex.witness_differences.C_A_station_minus_MODIS_Terra.period_2001_2020;
    kids.push(h("h3", {}, "Station air temperature against MODIS, before the orbit drift"));
    kids.push(h("p", {}, `Over 2001 to 2020 station maximum air temperature rises ${signed(w.sen_per_decade, 2)} °C per decade faster than MODIS (95% interval ${signed(w.ci95[0], 2)} to ${signed(w.ci95[1], 2)}, p = ${pFmt(w.p_mk)}). That gap is there before 2021.`));
  }
  if (ex.witness_differences && id === "C-C") {
    const w = ex.witness_differences.C_C_station_minus_MERRA2;
    kids.push(h("h3", {}, "Station record against MERRA-2"));
    kids.push(h("p", {}, `Station minus MERRA-2 over 1981 to 2025 is ${signed(w.sen_per_decade, 2)} °C per decade (95% interval ${signed(w.ci95[0], 2)} to ${signed(w.ci95[1], 2)}, p = ${pFmt(w.p_mk_hamed_rao)}): MERRA-2 warms faster than the stations. The MERRA-2 box includes sea cells; the station record is land only.`));
  }
  if (ex.holm_released_cases && ["C-B", "C-C", "C-D"].includes(id)) {
    const hz = ex.holm_released_cases, a = hz.holm_adjusted, a2 = hz.with_round2_C_B_p.holm_adjusted;
    kids.push(h("h3", {}, "Six claims, no adjustment across cases"));
    kids.push(h("p", {}, `Each claim was tested on its own at the 5% level. Exploratory arithmetic for the three that received a ruling (Holm adjustment of their p-values): Alaska ${pFmt(a["C-C"])}, Sahel ${pFmt(a["C-B"])}, Wisconsin ${pFmt(a["C-D"])}. With the first Sahel test (p = 0.030) the Sahel figure would be ${pFmt(a2["C-B"])}, which would not pass 0.05. The rulings are unchanged.`));
  }
  return kids;
}

export function exploratoryPanel(c) {
  const body = h("div", { class: "xp", "aria-live": "off" }, h("p", { class: "muted small" }, "Loading the exploratory checks…"));
  const d = disc("Exploratory checks after the results (not the registered test)", body);
  loadExploratory().then(ex => {
    if (!ex) { body.replaceChildren(h("p", { class: "muted small" }, "The exploratory checks could not be loaded.")); return; }
    try { body.replaceChildren(...build(c, ex)); } catch (e) { console.error(e); body.replaceChildren(h("p", { class: "muted small" }, "The exploratory checks could not be drawn.")); }
  });
  d.id = "exploratory-" + c.id;
  return d;
}

// Cases index: one line about the three released rulings (read from the same file).
export function indexNote() {
  const p = h("p", { class: "small muted case-index-note" }, "Six claims were registered and all six are shown. Each was tested on its own at the 5% level, with no adjustment across cases, and we chose well-known claims on purpose, for teaching. Registration fixes the data, region, period and test before download; it does not fix whether the answer was already known.");
  loadExploratory().then(ex => {
    if (!ex || !ex.holm_released_cases) return;
    const a = ex.holm_released_cases.holm_adjusted, a2 = ex.holm_released_cases.with_round2_C_B_p.holm_adjusted;
    p.append(` Exploratory, for the three rulings: Holm-adjusted p ${pFmt(a["C-C"])} for Alaska, ${pFmt(a["C-B"])} for the Sahel (${pFmt(a2["C-B"])} with the first Sahel test) and ${pFmt(a["C-D"])} for Wisconsin. Rulings unchanged.`);
  });
  return p;
}
