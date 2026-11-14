// Live data provider for Detective mode. STUB until the data worker confirms the NASA POWER browser endpoints.
// Contract (keep stable): fetchMonthly({ variable, box, startYear, endYear }) resolves to
//   { stub: bool, source: string, units: string, rows: [{ year, month, value }], note?: string }
// The real implementation will call NASA POWER from the browser (no key, no server) and area-average the cells
// inside the box. The stub makes SYNTHETIC numbers so every screen can be built and tested.
export const LIVE_IS_STUB = true;
export const MAX_BOX_DEG = { lat: 180, lon: 360 }; // to be set from the confirmed POWER limits

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function validateBox(b) {
  const errs = [];
  if (![b.s, b.n, b.w, b.e].every(Number.isFinite)) return ["Enter all four numbers."];
  if (b.s < -90 || b.n > 90) errs.push("Latitude must be between -90 and 90.");
  if (b.w < -180 || b.e > 180) errs.push("Longitude must be between -180 and 180.");
  if (b.s >= b.n) errs.push("The south edge must be below the north edge.");
  if (b.w >= b.e) errs.push("The west edge must be left of the east edge.");
  return errs;
}

export async function fetchMonthly({ variable, box, startYear, endYear }) {
  await new Promise(r => setTimeout(r, 350));
  const sp = variable.stub, r = rng(hash(variable.key + JSON.stringify(box)));
  const midLat = (box.s + box.n) / 2, north = midLat >= 0;
  const amp = sp.amp * Math.min(1, 0.35 + Math.abs(midLat) / 50) * (north ? 1 : -1);
  const rows = []; let prev = 0;
  for (let y = startYear; y <= endYear; y++) for (let m = 1; m <= 12; m++) {
    const noise = 0.5 * prev + Math.sqrt(0.75) * sp.noise * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); prev = noise;
    rows.push({ year: y, month: m, value: +(sp.base + amp * Math.sin(2 * Math.PI * (m - 4) / 12) * -1 * -1 + sp.trend * (y - 2000 + m / 12) / 10 + noise).toFixed(4) });
  }
  return { stub: true, source: variable.source, units: variable.units, rows, note: "SYNTHETIC preview numbers. The NASA POWER connection is not switched on yet." };
}
