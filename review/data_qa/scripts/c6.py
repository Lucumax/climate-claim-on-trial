import numpy as np, scipy.stats as st, pickle
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
R="<repo>/"; OUT=R+"review/data_qa/"
A=np.load("A_series.npz"); ys=A['ys']; W=pickle.load(open("WA.pkl","rb")); ours=A['shipped_0.25_support']; ts=W[('TS',True)]; t2=W[('T2M',True)]
vt=A['vtime']; d=ours-ts
def sen(x,y=ys): return st.theilslopes(x,y)[0]*10
for nm,ref in (("TS",ts),("T2M",t2)):
    dd=ours-ref
    r=st.linregress(vt,dd); print(nm,"LST-ref vs view time slope K/hr",round(r.slope,2),"r",round(r.rvalue,2),"p",round(r.pvalue,4))
    # use only 2001-2019 baseline of d vs nothing; adjust
    adj=ours-r.slope*(vt-np.median(vt[:19]))
    print("  adjusted LST Sen/dec",round(sen(adj),2),"OLS",round(st.linregress(ys,adj).slope*10,2),"p",round(st.linregress(ys,adj).pvalue,3))
# alternative simple: mean diff shift for 2020-2025 relative to 2001-2019 is 0.78; remove only post-2020 part: 
# regression on per-year only 2020-25 where vt changes
m=ys>=2020; r=st.linregress(vt[m],d[m]); print("2020-25 only: slope K/hr",round(r.slope,2),"r",round(r.rvalue,2),"p",round(r.pvalue,3),"n",m.sum())
# 2001-2019 sensitivity
for nm,x in (("LST",ours),("TS",ts),("T2M",t2),("night",A['night'])):
    m=ys<=2019; r=st.linregress(ys[m],x[m]); print(nm,"2001-2019 Sen",round(sen(x[m],ys[m]),2),"OLS",round(r.slope*10,2),"p",round(r.pvalue,3))
fig,ax=plt.subplots(1,3,figsize=(15,4.2))
ax[0].plot(ys,vt,"o-",color="#1f5f99"); ax[0].set_title("Mean daytime overpass time in the data (hrs UTC)\nflat to 2020, then 1.2 h earlier by 2025"); ax[0].set_xlabel("year")
ax[1].plot(ys,d,"o-",color="#c0561a"); ax[1].set_title("MODIS day LST minus POWER TS (degC)\nland cells, JJA"); ax[1].set_xlabel("year")
ax[2].scatter(vt,d,c=ys,cmap="viridis"); ax[2].set_xlabel("mean view time (UTC h)"); ax[2].set_title("LST - TS vs view time (colour = year)")
plt.tight_layout(); plt.savefig(OUT+"CA_viewtime_drift.png",dpi=110)
