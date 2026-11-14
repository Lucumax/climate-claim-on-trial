// Small DOM and number helpers. No dependencies.
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; e.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
export const pct = (f, d = 1) => (f * 100).toFixed(d) + "%";
export const signed = (v, d = 2) => { const a = Math.abs(v).toFixed(d); return (v > 0 && +a !== 0 ? "+" : v < 0 && +a !== 0 ? "\u2212" : "") + a; };
// A proper minus sign in a plain number, and degree signs in unit names ("degC" becomes "\u00b0C").
export const minus = x => String(x).replace(/^-(?=\d|\.)/, "\u2212");
export const fmtNum = (v, d = 2) => minus(v.toFixed(d));
export const U = u => String(u == null ? "" : u).replace(/\bdegC\b/g, "\u00b0C").replace(/\bdegF\b/g, "\u00b0F");
export const range = (a, b) => `${a}\u2013${b}`;
export const fmtPx = p => p == null ? "n/a" : p < 0.0001 ? "< 0.0001" : p < 0.01 ? p.toPrecision(3) : p.toFixed(3);
export const ivText = (lo, hi, d = 2) => `${signed(lo, d)} to ${signed(hi, d)}`;
export const fmtP = p => p == null ? "n/a" : p < 0.001 ? "< 0.001" : p.toFixed(3);
export function latStr(v) { return Math.abs(v).toFixed(2).replace(/\.?0+$/, "") + (v >= 0 ? "N" : "S"); }
export function lonStr(v) { return Math.abs(v).toFixed(2).replace(/\.?0+$/, "") + (v >= 0 ? "E" : "W"); }
export function boxStr(b) { return `${latStr(b.s)} to ${latStr(b.n)}, ${lonStr(b.w)} to ${lonStr(b.e)}`; }
export function announce(msg) { const l = document.getElementById("live"); if (l) { l.textContent = ""; setTimeout(() => { l.textContent = msg; }, 30); } }
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
