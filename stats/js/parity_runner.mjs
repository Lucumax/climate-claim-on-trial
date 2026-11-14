// Reads a JSON file of parity cases (argv[2]), writes the JS results as JSON to stdout.
import { readFileSync } from "node:fs";
import { olsTest, mannKendall, senInterval, seasonalSeries, detectiveVerdict, exploratoryGate, GATE_TABLE, LADDER_STEPS, CORRECTIONS } from "./trendtrial.js";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = { series: [], seasonal: [], verdict: [], gate: [], gateTable: GATE_TABLE, ladder: LADDER_STEPS, corrections: Object.keys(CORRECTIONS) };
for (const c of cases.series) {
  const ols = olsTest(c.t, c.y);
  const mk = mannKendall(c.y, c.t, { hr: true });
  const mk0 = mannKendall(c.y, c.t, { hr: false });
  const ci = mk.n >= 3 ? senInterval(c.y, c.t, mk.varS) : [null, null];
  const alt = {};
  for (const k of ["hr_all", "yw", "tfpw"]) alt[k] = mannKendall(c.y, c.t, { corr: k });
  out.series.push({ ols, mk, mk0, ci, alt });
}
for (const c of cases.seasonal) out.seasonal.push(seasonalSeries(c.rows, c.opts));
for (const c of cases.gate || []) out.gate.push(exploratoryGate(c.t, c.y));
for (const c of cases.verdict) out.verdict.push(detectiveVerdict(c.p, c.slope, c.n, c.units));
process.stdout.write(JSON.stringify(out, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v)));
