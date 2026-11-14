// Statistics adapter for Detective mode. All numbers come from vendor/trendtrial.js, a copy of stats/js/trendtrial.js
// (Python is the source of truth; the JS port is checked against it for parity). Refresh the copy with: sh web/tools/sync_stats.sh
import * as TT from "./vendor/trendtrial.js";

export const STATS_VERSION = TT.VERSION;
export const analyzeSeries = TT.analyzeSeries;
export const seasonalSeries = TT.seasonalSeries;
export const detectiveVerdict = TT.detectiveVerdict;

// Names and notes of the trial steps. If the module publishes its own (LADDER_STEPS, an array of {id, name, note}),
// those win, so a change to the correction in stats/js/trendtrial.js shows up here with no edit. The module may also
// describe its correction on the Mann-Kendall result (mk.correctionName, mk.correctionNote). Defaults are used only as a fallback.
const DEFAULTS = {
  raw: { name: "Raw season means, Mann-Kendall", note: "Start. Each year's season average is treated as an independent draw, seasonal cycle left in." },
  anomaly: { name: "Seasonal cycle removed", note: "Each month is compared with its own average for that calendar month before the yearly mean is taken. If no months are missing this cannot change the ranking, so the p-value may stay exactly the same." },
  autocorr: { name: "Autocorrelation correction (Hamed-Rao)", note: "Neighboring years can resemble each other, which makes a trend look more certain than it is. The test is widened to allow for that. With a short record the widening can be small." },
};
export function stepInfo(id, mk) {
  const fromModule = (TT.LADDER_STEPS || []).find(s => s.id === id);
  const base = { ...DEFAULTS[id], ...(fromModule ? { name: fromModule.name, note: fromModule.note } : {}) };
  if (id === "autocorr" && mk) {
    if (mk.correctionName) base.name = mk.correctionName;
    if (mk.correctionNote) base.note = mk.correctionNote;
  }
  return base;
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// rows: [{year, month, value}] monthly values already limited to the period. Returns yearly series for the chosen season and every test Detective shows.
export function analyzeRows(rows, { months, y0, y1, units }) {
  const ss = seasonalSeries(rows, { months, y0, y1 });
  const keep = ss.years.map((yr, i) => i).filter(i => ss.raw[i] !== null);
  const years = keep.map(i => ss.years[i]), raw = keep.map(i => ss.raw[i]), anomaly = keep.map(i => ss.anomaly[i]);
  const n = years.length;
  if (n < 8) return { n, years, raw, anomaly, tooShort: true, verdict: TT.detectiveVerdict(null, 0, n, units) };
  const A_raw = analyzeSeries(years, raw, { units }), A_an = analyzeSeries(years, anomaly, { units });
  const my = mean(raw), mt = mean(years);
  const olsIntercept = my - A_raw.ols.slope * mt, olsInterceptAn = mean(anomaly) - A_an.ols.slope * mt;
  let gate = null; try { gate = TT.exploratoryGate ? TT.exploratoryGate(years, anomaly) : null; } catch (e) { gate = null; }
  return { n, years, raw, anomaly, A_raw, A_an, olsIntercept, olsInterceptAn, nMonths: ss.nMonths, verdict: A_raw.verdict, gate };
}
export const olsTest = TT.olsTest;
export const exploratoryGate = TT.exploratoryGate;
