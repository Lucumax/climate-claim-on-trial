"""Build the synthetic example bundles (NOT real data) used by the web worker.

example_bundle.json          full bundle, validation block is a PLACEHOLDER that passes everything
example_bundle_withheld.json same data, no validation attached -> verdict withheld (shows the flag path)
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trendtrial.synth import make_claim_folder
from trendtrial.pipeline import run_claim

work = ROOT / "out" / "_fixture_work"
make_claim_folder(work / "SYN", ny=16, nx=24, trend_per_decade=0.5, frac_trend=0.7, phi=0.3, seed=7)

sys.path.insert(0, str(ROOT / "tests"))
from test_verdict_and_pipeline import fake_results  # noqa: E402
ph = fake_results()
ph["run"] = dict(kind="B_candidates", placeholder=True, note="PLACEHOLDER: every check set to pass, for the fixture only")
(work / "validation_placeholder.json").write_text(json.dumps(ph))
b = run_claim(work / "SYN", ROOT / "fixtures" / "_tmp_full", validation_path=work / "validation_placeholder.json", params=dict(boot_reps=1000))
b2 = run_claim(work / "SYN", ROOT / "fixtures" / "_tmp_withheld", params=dict(boot_reps=1000))
import shutil
shutil.move(ROOT / "fixtures" / "_tmp_full" / "bundle.json", ROOT / "fixtures" / "example_bundle.json")
shutil.move(ROOT / "fixtures" / "_tmp_withheld" / "bundle.json", ROOT / "fixtures" / "example_bundle_withheld.json")
shutil.rmtree(ROOT / "fixtures" / "_tmp_full"); shutil.rmtree(ROOT / "fixtures" / "_tmp_withheld")
print(b["verdict"]["text"]); print(b2["verdict"]["text"])
