import sys, json, re, numpy as np, importlib.util, datetime as dt
from concurrent.futures import ThreadPoolExecutor
R="./"
spec=importlib.util.spec_from_file_location("_t",R+"data/scripts/_token.py"); t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
assert t.ensure_token()
import earthaccess, netCDF4
earthaccess.login(strategy="environment"); s=earthaccess.get_requests_https_session()
gl=json.load(open(R+"data/C-B/C-B_cmr_granules.json"))["granules"]
def one(g):
    base=re.sub(r"\.html$","",g["opendap_url"])
    out={}
    for var,ce in (("time","/Grid/time"),("prec","/Grid/precipitation[0][1630:2049][1000:1079]"),("lat","/Grid/lat[1000:1079]"),("lon","/Grid/lon[1630:2049]")):
        for a in range(3):
            r=s.get(base+".dap.nc4",params={"dap4.ce":ce},timeout=300)
            if r.status_code==200: break
        r.raise_for_status()
        with netCDF4.Dataset("mem.nc",memory=r.content) as ds:
            name=ce.split("/")[-1].split("[")[0]
            v=ds["Grid"][name]; v.set_auto_maskandscale(False)
            out[var]=(np.array(v[:]), {k:str(v.getncattr(k)) for k in v.ncattrs()})
    return g,out
with ThreadPoolExecutor(6) as ex: res=list(ex.map(one,gl))
rows=[]; cubes=[]
for g,o in res:
    tv,ta=o["time"]; 
    rows.append((g["year"],g["month"],g["granule_ur"],tv.tolist(),ta.get("units"), ta.get("long_name")))
    p=o["prec"][0].astype(float); p[p<0]=np.nan  # (lon,lat)
    cubes.append((p.T*24).astype(np.float64)); 
    lat=o["lat"][0]
np.savez("reread_B.npz",cube=np.stack(cubes),lat=lat,year=[g["year"] for g,_ in res],month=[g["month"] for g,_ in res])
json.dump(rows,open("reread_B_time.json","w"))
print("done",res[0][1]["time"][1], res[0][1]["prec"][1])
