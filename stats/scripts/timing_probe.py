"""Timing probe: full pipeline on synthetic fields of the size of the registered regions."""
import sys, time, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trendtrial.synth import make_claim_folder
from trendtrial.pipeline import run_claim

work = ROOT / "out" / "_timing"
cases = {
    "LST 0.05deg 140x290 (40,600 cells) JJA 25 yr": dict(ny=140, nx=290, years=(2001, 2025), months=(6, 7, 8), dlat=0.05, dlon=0.05),
    "LST 0.25deg 28x58 (1,624 cells) JJA 25 yr": dict(ny=28, nx=58, years=(2001, 2025), months=(6, 7, 8)),
    "MERRA-2 T2M 861 cells annual 45 yr (12 months)": dict(ny=21, nx=41, years=(1981, 2025), months=tuple(range(1, 13))),
}
out = []
for name, kw in cases.items():
    t0 = time.time()
    make_claim_folder(work / "x", seed=1, **kw)
    t_gen = time.time() - t0
    t0 = time.time()
    b = run_claim(work / "x", work / "o", quiet=True)
    dt = time.time() - t0
    out.append((name, kw["ny"] * kw["nx"], round(t_gen, 1), round(dt, 1), round((work / "o" / "bundle.json").stat().st_size / 1e6, 2)))
    print(out[-1], flush=True)
