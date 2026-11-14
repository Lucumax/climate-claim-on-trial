"""Contrast check for the visual modules: merges css/tokens.css and css/viz.css (viz tokens win) and runs check_contrast.check on contrast_pairs_viz.json."""
import json, sys
from pathlib import Path
import check_contrast as cc
HERE = Path(__file__).resolve().parent
tok = cc.blocks((HERE.parent / "css" / "tokens.css").read_text(encoding="utf-8"))
viz = cc.blocks((HERE.parent / "css" / "viz.css").read_text(encoding="utf-8"))
def block(d): return "\n".join("  --%s: %s;" % kv for kv in d.items())
merged = {k: {**tok[k], **viz[k]} for k in tok}
css = ":root {\n%s\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"]) {\n%s\n  }\n}\n:root[data-theme=\"dark\"] {\n%s\n}\n" % (block(merged["light"]), block(merged["dark_media"]), block(merged["dark_attr"]))
rows, problems = cc.check(css, json.loads((HERE / "contrast_pairs_viz.json").read_text(encoding="utf-8")))
for p in problems: print("FAIL:", p)
print("VIZ CONTRAST CHECK:", "FAIL (%d)" % len(problems) if problems else "PASS (%d pair checks)" % len(rows))
sys.exit(1 if problems else 0)
