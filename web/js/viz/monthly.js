// Adapter for Investigate: turns the live monthly rows (one regional value per month, as fetched from NASA POWER) into the shape the spiral reads.
// Offered only for a complete twelve-month record: every year in the period must have all twelve months. Otherwise it returns null and the page
// keeps its yearly chart. Each month is compared with the average of the same calendar month over the chosen years (the printed baseline).
const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthlyData(rows, { y0, y1, name, units, unitsLabel, place, source }) {
  const by = new Map();
  for (const r of rows) { if (r.year < y0 || r.year > y1 || !Number.isFinite(r.value)) continue; if (!by.has(r.year)) by.set(r.year, new Array(12).fill(null)); by.get(r.year)[r.month - 1] = r.value; }
  const years = [...by.keys()].sort((a, b) => a - b);
  if (years.length < 3 || years.length !== y1 - y0 + 1 || years.some(y => by.get(y).some(v => v == null))) return null;
  const base = LABELS.map((_, m) => years.reduce((s, y) => s + by.get(y)[m], 0) / years.length);
  const anomaly = years.map(y => by.get(y).map((v, m) => v - base[m]));
  const wet = /mm per day|precip/i.test(units + " " + name);
  return { measure: name, region_name: place, units, units_label: unitsLabel, palette: wet ? "wet_up" : "warm_up", product_label: source, season_text: "all twelve months",
    baseline: { years: [years[0], years[years.length - 1]], text: `each calendar month's ${years[0]}\u2013${years[years.length - 1]} average` },
    monthly: { years, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], labels: LABELS, anomaly }, scale: { max: 1 } };
}
