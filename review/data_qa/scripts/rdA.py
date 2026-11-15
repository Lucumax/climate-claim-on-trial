import json, re, numpy as np, importlib.util, netCDF4
from concurrent.futures import ThreadPoolExecutor
R="./"
spec=importlib.util.spec_from_file_location("_t",R+"data/scripts/_token.py"); t=importlib.util.module_from_spec(spec); spec.loader.exec_module(t); assert t.ensure_token()
import earthaccess; earthaccess.login(strategy="environment"); s=earthaccess.get_requests_https_session()
gl=json.load(open(R+"data/C-A/C-A_cmr_granules.json"))["granules"]
G="/MODIS_MONTHLY_0_05DEG_CMG_LST/Data_Fields/"
RC="[1060:1199][1800:2089]"
VARS={"day":G+"LST_Day_CMG"+RC,"night":G+"LST_Night_CMG"+RC,"clear":G+"Clear_sky_days"+RC,"vtime":G+"Day_view_time"+RC,"vang":G+"Day_view_angl"+RC,"land":G+"Percent_land_in_grid"+RC,
      "lat":"/MODIS_MONTHLY_0_05DEG_CMG_LST/Latitude[1060:1199]","lon":"/MODIS_MONTHLY_0_05DEG_CMG_LST/Longitude[1800:2089]"}
def get1(base,path):
    for a in range(3):
        r=s.get(base+".dap.nc4",params={"dap4.ce":path},timeout=600)
        if r.status_code==200: break
    r.raise_for_status()
    with netCDF4.Dataset("m%d.nc"%id(r),memory=r.content) as ds:
        node=ds
        for p in path.split("[")[0].strip("/").split("/")[:-1]: node=node[p]
        v=node[path.split("[")[0].split("/")[-1]]; v.set_auto_maskandscale(False); return np.array(v[:])
def one(g):
    base=re.sub(r"\.html$","",g["opendap_url"]); o={k:get1(base,p) for k,p in VARS.items() if (k not in ("lat","lon","land") or g is gl[0])}
    return g,o
with ThreadPoolExecutor(5) as ex: res=list(ex.map(one,gl))
np.savez_compressed("reread_A.npz",**{k:np.stack([o[k] for g,o in res]) for k in ("day","night","clear","vtime","vang")},lat=res[0][1]["lat"],lon=res[0][1]["lon"],land=res[0][1]["land"],year=[g["year"] for g,_ in res],month=[g["month"] for g,_ in res],ur=[g["granule_ur"] for g,_ in res])
print("done",{k:(res[0][1][k].shape,res[0][1][k].dtype) for k in res[0][1]})
