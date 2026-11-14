import requests, numpy as np, scipy.stats as st
BASE="https://power.larc.nasa.gov/api/temporal/monthly/regional"
out={}
for lo,hi in [(-17,-7),(-7,3),(3,13),(13,23),(23,25)]:
    r=requests.get(BASE,params={"parameters":"PRECTOTCORR","community":"RE","latitude-min":10,"latitude-max":18,"longitude-min":lo,"longitude-max":hi,"start":1981,"end":2025,"format":"JSON"},timeout=300); r.raise_for_status()
    for f in r.json()["features"]:
        lon,lat,_=f["geometry"]["coordinates"]; out[(lat,lon)]=f["properties"]["parameter"]["PRECTOTCORR"]
cells=[c for c in out if 10<=c[0]<=18 and -17<=c[1]<=25]
w=np.cos(np.deg2rad([c[0] for c in cells]))
ys=np.arange(1981,2026)
s=np.array([np.mean([ (np.array([out[c][f"{y}{m:02d}"] for c in cells])*w).sum()/w.sum() for m in (6,7,8,9)]) for y in ys])
def lag1(x): x=x-x.mean(); return (x[:-1]*x[1:]).sum()/(x*x).sum()
def lag1d(x): t=np.arange(len(x)); return lag1(x-np.polyval(np.polyfit(t,x,1),t))
for a,b in ((1981,2025),(1981,2000),(2001,2025),(1981,2010)):
    x=s[(ys>=a)&(ys<=b)]; print(a,b,"n",len(x),"raw",round(lag1(x),2),"detr",round(lag1d(x),2),"Sen/dec",round(st.theilslopes(x,np.arange(len(x)))[0]*10,2))
np.save("power_B_1981.npy",s)
