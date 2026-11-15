import numpy as np, json
R="./"
d=np.load(R+"data/C-B/monthly.npz")
v=d['values'];y=d['year'];m=d['month'];lat=d['lat']
w=np.cos(np.deg2rad(lat))
reg=np.array([np.average(np.nanmean(v[i],axis=1),weights=w) for i in range(len(y))])
ys=np.arange(2001,2026)
s=np.array([reg[y==yy].mean() for yy in ys])
b=json.load(open(R+"web/data/bundle_C-B.json"))
an=np.array(b['regional']['anomaly']); print("bundle anomaly vs mine corr",np.corrcoef(an,s)[0,1], "diff sd",np.std(an-(s-s.mean())))
def lag1(x):
    x=x-x.mean(); return (x[:-1]*x[1:]).sum()/(x*x).sum()
def lag1d(x):
    t=np.arange(len(x)); r=x-np.polyval(np.polyfit(t,x,1),t); return lag1(r)
print("raw acf1",lag1(s),"pearson",np.corrcoef(s[:-1],s[1:])[0,1],"detr",lag1d(s))
print("detr pearson", np.corrcoef(*(lambda r:(r[:-1],r[1:]))(s-np.polyval(np.polyfit(np.arange(25),s,1),np.arange(25))))[0,1])
# each calendar month alone
for mm in (6,7,8,9):
    x=np.array([reg[(y==yy)&(m==mm)][0] for yy in ys]); print(mm,"raw",round(lag1(x),2),"detr",round(lag1d(x),2))
# subperiods
print("2001-2012 detr",lag1d(s[:12]),"2013-2025",lag1d(s[12:]))
# Permutation distribution of lag1 under iid
rng=np.random.default_rng(0); t=np.arange(25)
sim=[lag1d(rng.permutation(s)) for _ in range(20000)]
print("perm P(lag1d<=obs)",np.mean(np.array(sim)<=lag1d(s)), "perm mean",np.mean(sim),"sd",np.std(sim))
# leave out year
for k in range(25):
    pass
r=[lag1d(np.delete(s,k)) for k in range(25)]; print("leave-one-out range",min(r),max(r), "argmin", ys[np.argmin(r)], ys[np.argmax(r)])
print("diffs",np.round(np.diff(s),2))
np.save(SP+"/ourJJAS.npy",s)
# granule ids check
p=json.load(open(R+"data/C-B/C-B_provenance.json"))
import re
bad=0;seen=set()
for g,yy,mm in zip(p['granules'],y,m):
    mt=re.search(r"3IMERG\.(\d{4})(\d{2})(\d{2})-S000000-E235959\.(\d{2})\.V07B",g['granule_ur'])
    Y,M,D,M2=int(mt[1]),int(mt[2]),int(mt[3]),int(mt[4])
    if not (Y==yy==g['year'] and M==mm==g['month']==M2 and D==1): bad+=1
    seen.add(g['granule_ur'])
print("granules",len(p['granules']),"unique",len(seen),"mismatch",bad)
# month-day checks
cm=json.load(open(R+"data/C-B/C-B_cmr_granules.json")); print(cm.keys()); print(cm['granules'][0])
