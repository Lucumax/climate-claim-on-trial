import requests, json, sys, numpy as np, pickle, time
BASE="https://power.larc.nasa.gov/api/temporal/monthly/regional"
def fetch(par, la0, la1, lon_tiles):
    out={}
    for lo,hi in lon_tiles:
        for att in range(3):
            r=requests.get(BASE,params={"parameters":par,"community":"RE","latitude-min":la0,"latitude-max":la1,"longitude-min":lo,"longitude-max":hi,"start":2001,"end":2025,"format":"JSON"},timeout=300)
            if r.status_code==200: break
            print(r.status_code,r.text[:200]); time.sleep(5)
        j=r.json()
        for f in j["features"]:
            lon,lat,_=f["geometry"]["coordinates"]
            out[(lat,lon)]=f["properties"]["parameter"][par]
        print(par,lo,hi,len(j["features"]),r.url,flush=True)
    return out
res={}
# C-B box 10-18N, -17..25E
res["PRECTOTCORR_B"]=fetch("PRECTOTCORR",10,18,[(-17,-7),(-7,3),(3,13),(13,23),(23,25)])
# C-A box 30-37N, -90..-75.5E
for p in ("TS","T2M","PRECTOTCORR","CLOUD_AMT","ALLSKY_SFC_SW_DWN"):
    res[p+"_A"]=fetch(p,30,37,[(-90,-80),(-80,-75.5)])
pickle.dump(res,open("power.pkl","wb"))
