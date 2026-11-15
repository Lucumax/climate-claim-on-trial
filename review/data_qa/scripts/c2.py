import numpy as np, scipy.stats as st, json, re, datetime as dt, pickle
R="./"
z=np.load("reread_A.npz"); d=np.load(R+"data/C-A/monthly.npz"); nat=np.load(R+"data/C-A/C-A_subset_native.npz")
ys=np.arange(2001,2026)
print("lat file",z['lat'][:2],z['lat'][-2:],"lon",z['lon'][:2],z['lon'][-2:])
# 1 decode own way
raw=z['day'].astype(np.float64); bad=(raw==0)|(raw<7500)|(raw>65535)
K=np.where(bad,np.nan,raw*0.02); C=K-273.15
nv=nat['values'][:,::-1,:]  # native stored south-to-north; file is north-to-south
print("native npz lat asc?",nat['lat'][:2],"file lat desc",z['lat'][:2])
print("max abs diff own decode vs data native",np.nanmax(np.abs(C-nv)),"nan equal",np.array_equal(np.isnan(C),np.isnan(nv)))
print("raw stored range",np.nanmin(np.where(bad,np.nan,raw)),np.nanmax(np.where(bad,np.nan,raw)),"K range",np.nanmin(K),np.nanmax(K))
print("fraction bad",bad.mean(), "stored values of 0",(raw==0).mean(),"below 7500 nonzero",((raw<7500)&(raw>0)).mean())
# granule date vs DOY
bd=0
for ur,y,m in zip(z['ur'],z['year'],z['month']):
    mt=re.search(r"\.A(\d{4})(\d{3})\.",ur); dd=dt.date(int(mt[1]),1,1)+dt.timedelta(int(mt[2])-1)
    if not(dd.year==y and dd.month==m and dd.day==1): bd+=1
print("granule DOY mismatches",bd,"unique",len(set(z['ur'])))
# land mask
land=z['land'].astype(float)
print("percent_land: pct of native cells with LST valid in all months where land==0:", (~bad[:,land==0]).mean(), "valid frac where land>0",(~bad[:,land>0]).mean(), "land>0 frac",(land>0).mean(), "land>=50",(land>=50).mean())
# series
y=z['year']; m=z['month']; lat=z['lat']
w=np.cos(np.deg2rad(lat))[:,None]*np.ones(290)
def regmean(arr,mask=None):
    out=[]
    for i in range(75):
        a=arr[i]; ok=np.isfinite(a)&(True if mask is None else mask); out.append((a[ok]*w[ok]).sum()/w[ok].sum())
    return np.array(out)
def jja(x): return np.array([x[y==yy].mean() for yy in ys])
def sen(x): return st.theilslopes(x,ys)[0]*10
def ols(x): r=st.linregress(ys,x); return r.slope*10, r.pvalue
def mk(x): return st.kendalltau(ys,x)[1]
res={}
res['native_all']=jja(regmean(C))
res['native_land>0']=jja(regmean(C,land>0))
res['native_land>=50']=jja(regmean(C,land>=50))
# pipeline-like series: data/C-A monthly (0.25 deg, support) anomalies
v=d['values'];sup=d['support'];lat25=d['lat']
w25=np.cos(np.deg2rad(lat25))[:,None]*sup
mm=np.array([(np.nan_to_num(v[i])*w25).sum()/(w25*np.isfinite(v[i])).sum() for i in range(75)])
res['shipped_0.25_support']=jja(mm)
# fixed-cell version: only cells valid in all 75 months (no sampling change)
allv=np.isfinite(v).all(axis=0)&sup; w2=np.cos(np.deg2rad(lat25))[:,None]*allv
res['0.25_always_valid']=jja(np.array([(np.nan_to_num(v[i])*w2).sum()/w2.sum() for i in range(75)]))
print("always-valid cells",allv.sum(),"of support",sup.sum())
for k,x in res.items(): print(f"{k:24s} mean {x.mean():.2f}  Sen {sen(x):+.3f}  OLS {ols(x)[0]:+.3f} p={ols(x)[1]:.3f} MK p={mk(x):.3f}")
# per month
for mo in (6,7,8):
    x=regmean(C)[m==mo]; print("month",mo,"Sen",round(sen(x),3),"MK p",round(mk(x),3))
# night
Kn=z['night'].astype(float); badn=(Kn==0)|(Kn<7500); Cn=np.where(badn,np.nan,Kn*0.02-273.15)
night=jja(regmean(Cn)); print("NIGHT Sen",round(sen(night),3),"OLS",ols(night),"mean",night.mean().round(2))
# clear sky days, view time, angle
cl=z['clear'].astype(float); 
cld=jja(regmean(np.where(bad,np.nan,cl))); print("clear_sky_days mean over valid cells; Sen/dec",round(sen(cld),2),"mean",cld.mean().round(1), np.round(cld,1))
vt=z['vtime'].astype(float); vt=np.where((vt==255)|bad,np.nan,vt*0.2); vtm=jja(regmean(vt)); print("view time (hrs UTC) Sen/dec",round(sen(vtm),3),"mean",vtm.mean().round(2))
va=z['vang'].astype(float); va=np.where((va==255)|bad,np.nan,va); vam=jja(regmean(va)); print("view angle Sen/dec",round(sen(vam),3),"mean",vam.mean().round(2))
# per-year share of cell-months valid etc.
print("valid frac per year native land>0",np.round(jja(np.array([(~bad[i][land>0]).mean() for i in range(75)])),3))
# early vs late drop
x=res['shipped_0.25_support']; print("shipped series by year",np.round(x,2)); print("first half mean 2001-2012",x[:12].mean().round(2),"2014-2025",x[13:].mean().round(2))
np.savez("A_series.npz",ys=ys,**{k.replace('>','gt').replace('=','e'):v_ for k,v_ in res.items()},night=night,clear=cld,vtime=vtm,vang=vam)
# bundle
b=json.load(open(R+"web/data/bundle_C-A.json")); print("bundle sen",b['regional']['tests']['sen'],"baseline",b['regional']['baseline_mean'])
an=np.array(b['regional']['anomaly']); print("bundle anom corr with shipped series",np.corrcoef(an,x)[0,1])
