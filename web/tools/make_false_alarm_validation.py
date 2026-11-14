"""Extract the published validation rates used by the False-Alarm Planet page.
Source: stats/out/validation/validation_B.json (run B, seed 101). Run from anywhere: python web/tools/make_false_alarm_validation.py
Output: web/data/false_alarm_validation.json. Only no-trend scenarios are used."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = json.loads((HERE.parent.parent / "stats" / "out" / "validation" / "validation_B.json").read_text(encoding="utf-8"))
out = {"source": "stats/out/validation/validation_B.json", "seed": src["run"]["seed"], "alpha": src["run"]["alpha"], "q": src["run"]["q"],
       "regional": [], "cells": []}
for s in src["scenarios"]:
    if s["kind"] == "regional" and s["trend_sd_per_decade"] == 0 and s["noise"] == "normal" and s["gap_frac"] == 0 and s["id"].startswith("R-null-"):
        c = s["candidates"]
        out["regional"].append({"n": s["n"], "phi": s["phi"], "reps": c["mk_independent"]["size"]["R"],
                                "naive": round(c["mk_independent"]["size"]["value"], 4), "naive_se": round(c["mk_independent"]["size"]["se"], 4),
                                "corrected": round(c["yue_wang"]["size"]["value"], 4), "corrected_se": round(c["yue_wang"]["size"]["se"], 4)})
    if s["kind"] == "cells" and s["truth"] == "none":
        c = s["candidates"]
        out["cells"].append({"n": s["n"], "phi": s["phi"], "fields": s["fields"], "grid": s["grid"], "sigma_cells": s["spatial_smoothing_sigma"],
                             "naive": round(c["mk_independent"]["cell_size"]["value"], 4), "corrected": round(c["yue_wang"]["cell_size"]["value"], 4),
                             "bh_any_naive": c["mk_independent"]["p_any_bh_rejection"]["value"], "bh_any_corrected": c["yue_wang"]["p_any_bh_rejection"]["value"]})
dest = HERE.parent / "data" / "false_alarm_validation.json"
dest.write_text(json.dumps(out, indent=1), encoding="utf-8")
print("wrote", dest, len(out["regional"]), "regional rows,", len(out["cells"]), "cell rows")
