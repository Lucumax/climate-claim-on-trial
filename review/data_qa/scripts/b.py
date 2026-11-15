import numpy as np, pickle, scipy.stats as st
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
R="./"
OUT=R+"review/data_qa/"
res=pickle.load(open("power.pkl","rb"))
d=np.load(R+"data/C-B/monthly.npz"); v=d['values'];y=d['year'];m=d['month'];lat=d['lat']
w=np.cos(np.deg2rad(lat))
reg=np.array([np.average(np.nanmean(v[i],axis=1),weights=w) for i in range(len(y))])
ys=np.arange(2001,2026)
ours=np.array([reg[y==yy].mean() for yy in ys])
# POWER
P=res["PRECTOTCORR_B"]
cells=[(la,lo) for (la,lo) in P if 10<=la<=18 and -17<=lo<=25]
print("power cells",len(cells), "fill",sum(1 for c in cells for k,x in P[c].items() if x==-999))
las=np.array([c[0] for c in cells])
def ser(P,cells,months):
    pw=np.cos(np.deg2rad(np.array([c[0] for c in cells])))
    out=[]
    for yy in ys:
        mv=[]
        for mm in months:
            a=np.array([P[c][f"{yy}{mm:02d}"] for c in cells]); a=np.where(a==-999,np.nan,a)
            ok=np.isfinite(a); mv.append((a[ok]*pw[ok]).sum()/pw[ok].sum())
        out.append(np.mean(mv))
    return np.array(out)
pw=ser(P,cells,[6,7,8,9])
def lag1(x): x=x-x.mean(); return (x[:-1]*x[1:]).sum()/(x*x).sum()
def lag1d(x):
    t=np.arange(len(x)); return lag1(x-np.polyval(np.polyfit(t,x,1),t))
def sen(x):
    t=np.arange(len(x)); s=st.theilslopes(x,t)[0]*10; return s
for nm,s in (("IMERG(ours)",ours),("POWER",pw)):
    print(nm,"mean",s.mean().round(3),"acf1 raw",round(lag1(s),3),"detr",round(lag1d(s),3),"Sen/dec",round(sen(s),3),"MK p",round(st.kendalltau(np.arange(25),s)[1],3))
print("corr levels",np.corrcoef(ours,pw)[0,1],"spearman",st.spearmanr(ours,pw)[0])
dt=lambda x: x-np.polyval(np.polyfit(np.arange(25),x,1),np.arange(25))
print("corr detrended",np.corrcoef(dt(ours),dt(pw))[0,1])
print("corr first diffs",np.corrcoef(np.diff(ours),np.diff(pw))[0,1])
# sign of year to year changes agreement
print("sign agree diffs",np.mean(np.sign(np.diff(ours))==np.sign(np.diff(pw))))
# monthly
months_o={}
for mm in (6,7,8,9):
    o=np.array([reg[(y==yy)&(m==mm)][0] for yy in ys]); p=ser(P,cells,[mm]); months_o[mm]=(o,p)
    print(mm,"corr",round(np.corrcoef(o,p)[0,1],3),"ours mean",o.mean().round(2),"power mean",p.mean().round(2),"acf1 ours",round(lag1(o),2),"power",round(lag1(p),2))
# POWER longer record lag1 context 1981-2025? skip
# permutation
rng=np.random.default_rng(1)
print("IMERG detr lag1 vs iid permutation p", np.mean([lag1d(rng.permutation(ours))<=lag1d(ours) for _ in range(20000)]))
np.save("ours_B.npy",ours); np.save("power_B.npy",pw)
fig,ax=plt.subplots(3,1,figsize=(9,10))
ax[0].plot(ys,ours,"o-",label="IMERG V07 (our pipeline)",color="#1f5f99"); ax[0].plot(ys,pw,"s--",label="POWER PRECTOTCORR (witness)",color="#c0561a")
ax[0].set_title(f"Sahel JJAS mean rain (mm/day), area-weighted; r = {np.corrcoef(ours,pw)[0,1]:.2f}"); ax[0].legend(); ax[0].set_xlabel("year"); ax[0].set_ylabel("mm/day"); ax[0].set_xticks(ys[::2])
tt=np.arange(len(reg)); ax[1].plot(tt,reg,".-",color="#1f5f99"); 
for i in range(0,100,4): ax[1].axvline(i-0.5,color="grey",lw=0.4)
ax[1].set_xticks(range(0,100,8)); ax[1].set_xticklabels([f"{y[i]}-{m[i]:02d}" for i in range(0,100,8)],rotation=45); ax[1].set_title("IMERG regional monthly series, Jun-Sep only, 100 granules (grey lines = new year)"); ax[1].set_ylabel("mm/day")
for mm,c in zip((6,7,8,9),("#1f5f99","#c0561a","#2a7f3f","#7a4a9e")):
    ax[2].plot(ys,months_o[mm][0],"o-",label=f"month {mm}",color=c,ms=3)
ax[2].legend(ncol=4); ax[2].set_title("IMERG by calendar month: no month is double-counted or shifted"); ax[2].set_xlabel("year"); ax[2].set_ylabel("mm/day")
plt.tight_layout(); plt.savefig(OUT+"CB_series_imerg_vs_power.png",dpi=110)
