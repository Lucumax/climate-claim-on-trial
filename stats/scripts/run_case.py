"""Run one case file and publish it for the web app.

usage: python scripts/run_case.py C-C
reads  data/<id>/claim.json + monthly.npz, stats/out/validation/validation_results.json
       (the NO2 pair C-E1 and C-E2 use validation_results_n21.json, which adds the 21-year simulations)
writes stats/out/<id>/bundle.json, web/data/bundle_<id>.json, and updates web/data/index.json
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from trendtrial.pipeline import run_claim  # noqa: E402

cid = sys.argv[1]
NO2 = cid in ("C-E1", "C-E2")
val = ROOT / "out" / "validation" / ("validation_results_n21.json" if NO2 else "validation_results.json")
b = run_claim(REPO / "data" / cid, ROOT / "out" / cid, validation_path=val if val.exists() else None)
web = REPO / "web" / "data"
web.mkdir(parents=True, exist_ok=True)
shutil.copyfile(ROOT / "out" / cid / "bundle.json", web / f"bundle_{cid}.json")
idx_path = web / "index.json"
idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"bundles": []}
name = f"bundle_{cid}.json"
if not NO2 and name not in idx["bundles"]:   # the NO2 pair is listed by scripts/run_no2.py, not here
    idx["bundles"].append(name)
idx_path.write_text(json.dumps(idx, indent=1), encoding="utf-8")
print(b["verdict"]["id"], "|", b["verdict"]["text"])
print("gate:", json.dumps(b["validation"]["gate"]))
