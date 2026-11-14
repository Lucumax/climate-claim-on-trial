// Fixed plain-English sentence templates for Detective results. Deterministic: numbers in, sentences out. No model, no free text.
import { signed, fmtP } from "./util.js";

export const ALPHA = 0.05;
export const PERSISTENCE_CAVEAT = "P-values from series whose years resemble each other tend to be too small, which is why step 5 applies a correction.";
export const INTERVAL_EXPLORATORY = "95% interval (Sen slope, analytic; exploratory, not checked for your series)";
// The statistics module's fixed sentence says a significant trend is "unlikely to be chance alone". That invites an inverse-probability reading, so we show the careful version.
export const fixVerdict = t => String(t).replace(/degC/g, "°C").replace(/the (rise|fall) is unlikely to be chance alone/, "a pattern this strong would be rare if there were no trend (p < 0.05)");

export function pWords(p) {
  if (p < ALPHA) return `The p-value is ${fmtP(p)}, which is below 0.05. By the usual rule, that is called a statistically significant trend: a pattern this clear would be unusual if there were no real trend.`;
  return `The p-value is ${fmtP(p)}, which is above 0.05. By the usual rule this is not called significant. That does not mean there is no trend, and it does not mean the change is unimportant. It means this record, as tested, is not clear enough to rule out chance. A longer record can help.`;
}

export function directionWord(slope) { return slope > 0 ? "rose" : slope < 0 ? "fell" : "did not change"; }

export function trendWords(name, slope, lo, hi, units) {
  const spans0 = lo <= 0 && hi >= 0;
  let t = `Over this period, ${name.toLowerCase()} ${directionWord(slope)} by about ${Math.abs(slope).toPrecision(2)} ${units} per decade. The 95% range runs from ${signed(lo, 3)} to ${signed(hi, 3)}.`;
  if (spans0) t += " That range includes zero, so a flat line is among the plausible answers.";
  return t;
}

// Compare a rung with the one before it, in either direction.
export function stepWords(prev, cur) {
  if (!prev) return "Starting point.";
  const d = cur.p - prev.p, rel = prev.p > 0 ? Math.abs(d) / prev.p : 0;
  if (Math.abs(d) < 0.0005 || rel < 0.02) return "This step barely changed the p-value.";
  return d > 0 ? `This step made the p-value larger (${fmtP(prev.p)} to ${fmtP(cur.p)}): the result looks less certain.` : `This step made the p-value smaller (${fmtP(prev.p)} to ${fmtP(cur.p)}): the result looks more certain.`;
}

export function sigClass(p) { return p < ALPHA ? "ok" : "neutral"; }
export function sigLabel(p) { return p < ALPHA ? "Significant at 0.05" : "Not significant at 0.05"; }

// For a record whose calibration check failed: the p-value is a description, never a significance label.
export function descLabel(p) { return p < ALPHA ? "p below 0.05 (descriptive)" : "p above 0.05 (descriptive)"; }
export function descPWords(p) { return `The p-value is ${fmtP(p)}. Calibration failed for this record, so it is shown as a description only and is not read as a significance finding.`; }
