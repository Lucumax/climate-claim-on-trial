import numpy as np, scipy.stats as st
R="./"
d=np.load(R+"data/C-B/monthly.npz"); v=d['values'];y=d['year'];lat=d['lat'];lon=d['lon']
ys=np.arange(2001,2026)
def lag1(x): x=x-x.mean(); return (x[:-1]*x[1:]).sum()/(x*x).sum()
def lag1d(x): t=np.arange(len(x)); return lag1(x-np.polyval(np.polyfit(t,x,1),t))
def sub(mask2d):
    w=np.cos(np.deg2rad(lat))[:,None]*mask2d
    r=np.array([(np.nan_to_num(v[i])*w).sum()/w.sum() for i in range(100)])
    return np.array([r[y==yy].mean() for yy in ys])
L,O=np.meshgrid(lat,lon,indexing="ij")
for nm,mk in (("west lon<0",O<0),("east lon>=0",O>=0),("lat<14",L<14),("lat>=14",L>=14),("excl lon<-12",O>=-12),("all",O>-999)):
    s=sub(mk.astype(float)); print(nm,"raw",round(lag1(s),2),"detr",round(lag1d(s),2),"Sen",round(st.theilslopes(s,np.arange(25))[0]*10,2))
print("mean by lat row 0 vs 79 Aug", v[2][0].mean(), v[2][79].mean())
