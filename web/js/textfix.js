// One writing style for the numbers and codes that many views print: "p = 0.032" (never "p 0.032" or "p = < 0.001"), "C–A" with an en dash, "±", and a true minus.
// Views build their own strings; this runs over the text nodes they add to the page, so every route reads the same without editing each template.
// Skipped: code, pre, inputs, scripts (commands and file names keep their hyphens).
const SKIP = new Set(["PRE", "CODE", "SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
export const fixText = t => t
  .replace(/\bp = < ?(\d)/g, "p < $1")
  .replace(/\bp (?=[<\d])/g, "p = ")
  .replace(/\bp = (?=<)/g, "p ")
  .replace(/\bC-([A-E]\d?)\b/g, "C–$1")
  .replace(/\+\/- /g, "± ")
  .replace(/(^|[\s(])-(?=\d)/g, "$1−");
function walk(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue; if (!v || !/[pC+-]/.test(v)) return;
    const f = fixText(v); if (f !== v) node.nodeValue = f;
    return;
  }
  if (node.nodeType !== 1 || SKIP.has(node.tagName) || node.classList && node.classList.contains("mono")) return;
  for (const k of node.childNodes) walk(k);
}
export function watchText(root) {
  walk(root);
  const mo = new MutationObserver(list => {
    for (const m of list) { for (const n of m.addedNodes) walk(n); if (m.type === "characterData" && m.target.parentNode && !SKIP.has(m.target.parentNode.tagName)) { const v = m.target.nodeValue, f = fixText(v); if (f !== v) m.target.nodeValue = f; } }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return mo;
}
