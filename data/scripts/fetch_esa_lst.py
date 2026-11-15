"""E2: fetch ESA LST CCI IRCDR L3S v3.00 monthly DAY, SE US box, JJA, by anonymous OPeNDAP subsetting.
usage: python -I fetch_esa_lst.py OUTDIR   (raw int16 subsets saved to OUTDIR as npz; nothing global is downloaded)"""
import sys, os, json, time, hashlib
import numpy as np, netCDF4
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BASE = "https://dap.ceda.ac.uk/thredds/dodsC/neodc/esacci/land_surface_temperature/data/MULTISENSOR_IRCDR/L3S/0.01/v3.00/monthly"
I0, I1, J0, J1 = 12000, 12700, 9000, 10450   # lat 30.005..36.995, lon -89.995..-75.505
meta = {}
for y in range(2001, 2025):
    for m in (6, 7, 8):
        key = f"{y}-{m:02d}"; fn = f"{OUT}/{key}.npz"
        if os.path.exists(fn): continue
        url = f"{BASE}/{y}/{m:02d}/ESACCI-LST-L3S-LST-IRCDR_-0.01deg_1MONTHLY_DAY-{y}{m:02d}01000000-fv3.00.nc"
        for attempt in range(5):
            try:
                ds = netCDF4.Dataset(url); ds.set_auto_maskandscale(False)
                d = dict(lst=ds['lst'][0, I0:I1, J0:J1], lcc=ds['lcc'][0, I0:I1, J0:J1], n=ds['n'][0, I0:I1, J0:J1],
                         unc=ds['lst_uncertainty'][0, I0:I1, J0:J1], solze=ds['solze'][0, I0:I1, J0:J1],
                         lat=ds['lat'][I0:I1], lon=ds['lon'][J0:J1])
                np.savez_compressed(fn, **d)
                meta[key] = dict(url=url, platform=getattr(ds, 'platform', None), sensor=getattr(ds, 'sensor', None), source=getattr(ds, 'source', None))
                ds.close(); print(key, meta[key]['platform'], meta[key]['sensor'], flush=True); break
            except Exception as e:
                print(key, 'retry', attempt, str(e)[:100], flush=True); time.sleep(5)
        else:
            print(key, 'FAILED', flush=True)
json.dump(meta, open(f"{OUT}/meta_new.json", "w"), indent=1)
