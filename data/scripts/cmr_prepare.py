"""CMR search (no login) for claims C-A and C-B: collection facts and the exact granule lists (JJA / JJAS, 2001-2025)."""
import json, datetime as dt, sys
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parent.parent
CMR = "https://cmr.earthdata.nasa.gov/search"
def collection(cid):
    u = requests.get(f"{CMR}/collections.umm_json", params={"concept_id": cid}, timeout=60).json()["items"][0]["umm"]
    return {"concept_id": cid, "short_name": u["ShortName"], "version": u["Version"], "doi": u["DOI"]["DOI"], "title": u["EntryTitle"],
            "temporal": u["TemporalExtents"][0]["RangeDateTimes"]}
def granules(cid, months, y0, y1):
    out = []
    for y in range(y0, y1 + 1):
        for m in months:
            s = dt.date(y, m, 1); e = dt.date(y + (m == 12), (m % 12) + 1, 1)
            j = requests.get(f"{CMR}/granules.umm_json", params={"collection_concept_id": cid, "page_size": 20,
                  "temporal": f"{s}T00:00:00Z,{e}T00:00:00Z"}, timeout=60).json()
            # keep granules whose start date lies in this month
            for it in j["items"]:
                u = it["umm"]; b = u["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
                if b[:7] != f"{y}-{m:02d}": continue
                size = (u.get("DataGranule", {}).get("ArchiveAndDistributionInformation") or [{}])[0]
                urls = {r["Type"] + ("|s3" if r["URL"].startswith("s3") else ""): r["URL"] for r in u["RelatedUrls"] if r["Type"] in ("GET DATA", "GET DATA VIA DIRECT ACCESS", "USE SERVICE API")}
                out.append({"year": y, "month": m, "granule_ur": u["GranuleUR"], "begin": b, "size_mb": size.get("Size"),
                            "https_url": urls.get("GET DATA"), "s3_url": urls.get("GET DATA VIA DIRECT ACCESS|s3"), "opendap_url": urls.get("USE SERVICE API")})
    return out
now = dt.datetime.now(dt.timezone.utc).isoformat()
for claim, cid, months, folder in [("C-D", "C1443775657-LAADS", [6,7,8], "C-D")] if len(sys.argv)>1 and sys.argv[1]=="D" else [("C-B", "C2723754851-GES_DISC", [6,7,8,9], "C-B"), ("C-A", "C2565788897-LPCLOUD", [6,7,8], "C-A")]:
    y0 = 2003 if claim == "C-D" else 2001
    col = collection(cid); g = granules(cid, months, y0, 2025)
    exp = len(months) * (2025 - y0 + 1)
    rec = {"claim": claim, "cmr_queried_utc": now, "collection": col, "n_granules": len(g), "n_expected": exp,
           "missing_year_months": sorted({f"{y}-{m:02d}" for y in range(y0, 2026) for m in months} - {f"{x['year']}-{x['month']:02d}" for x in g}),
           "total_size_mb": round(sum(x["size_mb"] or 0 for x in g), 1), "granules": g}
    (ROOT / folder / f"{claim}_cmr_granules.json").write_text(json.dumps(rec, indent=1))
    print(claim, col["short_name"], col["version"], col["doi"], "granules", len(g), "/", exp, "missing", rec["missing_year_months"], "total MB", rec["total_size_mb"])
