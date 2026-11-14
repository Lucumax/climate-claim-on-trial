r"""Write the registered-case input contract for C-E1 (eastern US NO2, claimed fallen) and C-E2 (Indo-Gangetic Plain NO2, claimed risen), WP0 addendum 3:
data/C-E1 and data/C-E2: claim.json, monthly.npz (values T x ny x nx in 1e15 molecules/cm2, 0.25 deg, 12 months x 2005-2025, NaN = missing; lat ascending, lon ascending; year, month; support),
C-E*_qc.json, C-E*_provenance.json. Reads the boxes saved by build_no2.py. NO TREND AND NO TIME-SERIES SUMMARY BY YEAR OF THE NO2 VALUES IS COMPUTED OR PRINTED HERE:
QC counts only valid cells (coverage), not values by year.
Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\make_no2_cases.py"""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import libcommon as L

Z = np.load(L.SCRATCH / "no2_boxes.npz"); stage = json.load(open(L.SCRATCH / "no2_omi_prov.json"))
times = [tuple(t) for t in Z["times"]]; keep = [i for i, (y, m) in enumerate(times) if 2005 <= y <= 2025]
assert len(keep) == 252, len(keep)
year = np.array([times[i][0] for i in keep], np.int16); month = np.array([times[i][1] for i in keep], np.int8)
col = stage["collection"]
CASES = {
 "C-E1": dict(text="Tropospheric nitrogen dioxide over the eastern United States has fallen", direction="decrease", plain="annual mean tropospheric nitrogen dioxide (a gas from burning fuel)",
              region="the eastern United States", box=dict(lat_min=35, lat_max=45, lon_min=-90, lon_max=-70)),
 "C-E2": dict(text="Tropospheric nitrogen dioxide over the Indo-Gangetic Plain (northern India) has risen", direction="increase", plain="annual mean tropospheric nitrogen dioxide (a gas from burning fuel)",
              region="the Indo-Gangetic Plain (northern India)", box=dict(lat_min=22, lat_max=30, lon_min=75, lon_max=88)),
}
for cid, C in CASES.items():
    out = L.ROOT / "data" / cid; out.mkdir(parents=True, exist_ok=True)
    v = Z[f"box_{cid}"][keep].astype(np.float32); lat = Z[f"lat_{cid}"]; lon = Z[f"lon_{cid}"]
    support = np.isfinite(v).mean(axis=0) >= 0.5
    np.savez_compressed(out / "monthly.npz", values=v, lat=lat, lon=lon, year=year, month=month, support=support)
    claim = {"claim_id": cid, "claim_text": C["text"], "variable": "ColumnAmountNO2TropCloudScreened (OMI/Aura tropospheric NO2 column, cloud-screened)", "variable_plain": C["plain"],
             "units": "1e15 molecules/cm2", "direction": C["direction"], "season_months": list(range(1, 13)), "period": [2005, 2025], "region_name": C["region"], "region_box": C["box"],
             "product": {"name": f"{col['short_name']} ({col['title'].strip()})", "version": col["version"], "doi": col["doi"]}, "is_model_data": False,
             "preregistered": True, "registration_ref": "WP0 addendum 3 (Sat Nov 14 13:15 ET)"}
    (out / "claim.json").write_text(json.dumps(claim, indent=1))
    fin = np.isfinite(v)
    per_cal = {str(m): float(fin[month == m].mean()) for m in range(1, 13)}
    qc = {"claim": cid, "shape_monthly_npz": list(v.shape), "grid_deg": 0.25, "cells_in_box": int(v.shape[1] * v.shape[2]), "support_cells": int(support.sum()),
          "support_rule": "cell valid in >= 50% of the 252 months (no land mask: the registered region is the box)", "valid_fraction_all": float(fin.mean()),
          "valid_fraction_within_support": float(fin[:, support].mean()), "min_month_valid_fraction_within_support": float(min(fin[i][support].mean() for i in range(v.shape[0]))),
          "valid_fraction_by_calendar_month_mean": per_cal, "months_all_missing": [f"{y}-{m:02d}" for i, (y, m) in enumerate(zip(year, month)) if not fin[i].any()],
          "daily_granules_per_month_min": int(Z["ndays"][keep].min()), "daily_granules_per_month_max": int(Z["ndays"][keep].max()),
          "monthly_cell_rule": "mean of the daily cloud-screened 0.25 degree cells over valid days, kept if >= 5 valid days",
          "row_anomaly": "handled by NASA's own screening inside the Level-3 field (XTrackQualityFlagsModified good, VcdQualityFlags good, SZA <= 85, cloud fraction <= 0.30); no extra step here. Per-day coverage still falls after 2007-2011, which is why the valid-day rule matters.",
          "lat_range": [float(lat.min()), float(lat.max())], "lon_range": [float(lon.min()), float(lon.max())],
          "note": "Counts of valid cells only; no trend or yearly summary of NO2 values computed."}
    (out / f"{cid}_qc.json").write_text(json.dumps(qc, indent=1))
    d0, d1 = "2005-01-01", "2025-12-31"
    gl = [g for g in stage["granules"] if d0 <= g["date"] <= d1]
    prov = {"claim": cid, "short_name": col["short_name"], "version": col["version"], "doi": col["doi"], "concept_id": col["concept_id"],
            "access_route": stage["access"], "retrieved_utc": [stage["t0"], stage["t1"]], "n_daily_granules": len(gl), "granules": gl,
            "aggregation": "daily cloud-screened 0.25 degree cells -> monthly mean over valid days (>= 5) at 0.25 degree; no further aggregation in this contract (native 0.25 degree)",
            "decode": "ColumnAmountNO2TropCloudScreened float32 molecules/cm2, scale 1, offset 0, fill -1.2676506e+30 -> NaN, divided by 1e15 once",
            "builder_scripts": ["data/library/scripts/build_no2.py", "data/library/scripts/make_no2_cases.py"],
            "files": {p.name: L.sha_file(p) for p in sorted(out.glob("*")) if p.suffix in (".npz", ".json") and "provenance" not in p.name}}
    (out / f"{cid}_provenance.json").write_text(json.dumps(prov, indent=1))
    print(cid, "monthly.npz", (out / "monthly.npz").stat().st_size / 1e6, "MB", v.shape, "support", int(support.sum()), "valid frac", round(qc["valid_fraction_all"], 3))
