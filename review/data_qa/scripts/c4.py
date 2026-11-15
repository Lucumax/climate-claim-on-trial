import numpy as np, scipy.stats as st, pickle
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
R="./"; OUT=R+"review/data_qa/"
res=pickle.load(open("power.pkl","rb")); A=np.load("A_series.npz"); z=np.load("reread_A.npz"); d=np.load(R+"data/C-A/monthly.npz")
ys=np.arange(2001,2026); sup=d['support']; lat25=d['lat']; lon25=d['lon']
ours=A['shipped_0.25_support']
def sen(x): return st.theilslopes(x,ys)[0]*10
def mkp(x): return st.kendalltau(ys,x)[1]
def lsr(x): r=st.linregress(ys,x); return r.slope*10,r.pvalue
def pser(P,months=(6,7,8),land=True):
    cells=[c for c in P if 30<=c[0]<=37 and -90<=c[1]<=-75.5]
    if land:
        keep=[]
        for la,lo in cells:
            i=np.argmin(abs(lat25-la)); j=np.argmin(abs(lon25-lo)); 
            if sup[i,j]: keep.append((la,lo))
        cells=keep
    w=np.cos(np.deg2rad([c[0] for c in cells]))
    out=np.array([np.mean([(np.array([P[c][f"{y}{m:02d}"] for c in cells])*w).sum()/w.sum() for m in months]) for y in ys])
    return out,len(cells)
rows=[]
W={}
for nm in ("TS","T2M","PRECTOTCORR","CLOUD_AMT","ALLSKY_SFC_SW_DWN"):
    for land in (True,False):
        x,n=pser(res[nm+"_A"],land=land); W[(nm,land)]=x
        s,p=lsr(x); print(f"{nm:18s} land={land!s:5} cells={n:4d} mean {x.mean():8.2f} Sen {sen(x):+.3f}/dec OLS {s:+.3f} (p={p:.3f}) MK p={mkp(x):.3f}  r with ours {np.corrcoef(x,ours)[0,1]:+.2f}  r with ours detr {np.corrcoef(x-np.polyval(np.polyfit(ys,x,1),ys),ours-np.polyval(np.polyfit(ys,ours,1),ys))[0,1]:+.2f}")
# Also anomaly relationships
night=A['night']
print("ours vs POWER TS(land) r",np.corrcoef(ours,W[('TS',True)])[0,1],"ours vs PRECTOTCORR r",np.corrcoef(ours,W[('PRECTOTCORR',True)])[0,1],"vs CLOUD r",np.corrcoef(ours,W[('CLOUD_AMT',True)])[0,1],"vs SW r",np.corrcoef(ours,W[('ALLSKY_SFC_SW_DWN',True)])[0,1])
print("night vs T2M r",np.corrcoef(night,W[('T2M',True)])[0,1])
# multi-regression of ours on precip & trend (diagnostic)
X=np.c_[np.ones(25),W[('PRECTOTCORR',True)]]; b=np.linalg.lstsq(X,ours,rcond=None)[0]; resid=ours-X@b; print("ours ~ precip slope",b[1],"R2",1-resid.var()/ours.var(), "Sen of residual/dec",sen(resid))
# clear-sky days popcount
def pop(a):
    a=a.astype(np.uint32); c=np.zeros(a.shape,np.int16)
    for b_ in range(32): c+=((a>>b_)&1).astype(np.int16)
    return c
cl=np.stack([pop(z['clear'][i]) for i in range(75)]).astype(float)
dayraw=z['day']; ok=dayraw>0
lat=z['lat']; w=np.cos(np.deg2rad(lat))[:,None]*np.ones(290)
cm=np.array([(cl[i][ok[i]]*w[ok[i]]).sum()/w[ok[i]].sum() for i in range(75)])
cj=np.array([cm[z['year']==y].mean() for y in ys]); print("clear-sky days per month (popcount of Clear_sky_days), JJA mean",cj.mean().round(2),"Sen/dec",round(sen(cj),2),"MK p",round(mkp(cj),3), np.round(cj,1))
print("corr(ours, clear days)",np.corrcoef(ours,cj)[0,1])
# spatial: share of 0.25 cells with negative Sen
v=d['values']; y=d['year']
cube=np.stack([v[y==yy].mean(axis=0) for yy in ys])
sl=np.full(sup.shape,np.nan)
for i in range(28):
    for j in range(58):
        if sup[i,j]: sl[i,j]=st.theilslopes(cube[:,i,j],ys)[0]*10
print("share of land cells with negative cell Sen",np.mean(sl[sup]<0).round(3),"median cell Sen",np.nanmedian(sl).round(3), "pct  < -0.3",np.mean(sl[sup]<-0.3).round(2))
# plot
fig,ax=plt.subplots(2,2,figsize=(12,8)); a=ax.ravel()
a[0].plot(ys,ours,"o-",label="MOD11C3 day LST (ours)",color="#1f5f99"); a[0].plot(ys,A['night'],"s-",label="MOD11C3 night LST",color="#555"); a[0].set_title("Terra LST, JJA, land: day (Sen %+.2f) vs night (%+.2f) degC/decade"%(sen(ours),sen(A['night']))); a[0].legend(); a[0].set_ylabel("degC")
t=lambda x:(x-x.mean())/x.std()
a[1].plot(ys,t(ours),"o-",label="MODIS day LST",color="#1f5f99"); a[1].plot(ys,t(W[('TS',True)]),"s--",label="POWER TS (MERRA-2 skin)",color="#c0561a"); a[1].plot(ys,t(W[('T2M',True)]),"^:",label="POWER T2M",color="#2a7f3f"); a[1].set_title("Standardised JJA series, land cells"); a[1].legend()
a[2].plot(ys,t(ours),"o-",color="#1f5f99",label="MODIS day LST"); a[2].plot(ys,t(W[('PRECTOTCORR',True)]),"s--",color="#7a4a9e",label="POWER precip") ; a[2].plot(ys,t(W[('CLOUD_AMT',True)]),"^:",color="#777",label="POWER cloud amount"); a[2].legend(); a[2].set_title("Standardised: day LST vs POWER precip and cloud")
im=a[3].imshow(sl,origin="lower",cmap="RdBu_r",vmin=-1,vmax=1,extent=[lon25.min(),lon25.max(),lat25.min(),lat25.max()]); a[3].set_title("Cell Sen slope degC/decade (shipped 0.25 deg)"); plt.colorbar(im,ax=a[3])
for q in a[:3]: q.set_xlabel("year")
plt.tight_layout(); plt.savefig(OUT+"CA_series_and_witnesses.png",dpi=110)
pickle.dump(W,open("WA.pkl","wb"))
