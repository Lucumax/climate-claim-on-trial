import numpy as np, scipy.stats as st, pickle
A=np.load("A_series.npz"); ys=A['ys']; W=pickle.load(open("WA.pkl","rb"))
print("year  dayLST  viewtime(UTC h)  viewang  TS  T2M  diff(LST-TS) ")
ours=A['shipped_0.25_support']; ts=W[('TS',True)]
for i,y in enumerate(ys): print(y, round(ours[i],2), round(A['vtime'][i],2), round(A['vang'][i],1), round(ts[i],2), round(W[('T2M',True)][i],2), round(ours[i]-ts[i],2))
def sen(x,y): return st.theilslopes(x,y)[0]*10
for a,b in ((2001,2025),(2001,2019),(2001,2020),(2001,2021),(2001,2022),(2008,2025),(2001,2015)):
    m=(ys>=a)&(ys<=b); print(a,b,"LST Sen",round(sen(ours[m],ys[m]),2),"TS Sen",round(sen(ts[m],ys[m]),2),"T2M",round(sen(W[('T2M',True)][m],ys[m]),2),"night",round(sen(A['night'][m],ys[m]),2),"vtime",round(sen(A['vtime'][m],ys[m]),3))
d=ours-ts; print("LST-TS difference Sen/dec",round(sen(d,ys),2),"first 12y mean",d[:12].mean().round(2),"last 12",d[-12:].mean().round(2), "MK p",st.kendalltau(ys,d)[1].round(4))
dn=A['night']-W[('T2M',True)]; print("night-T2M diff Sen",round(sen(dn,ys),2))
# post-2020 break
m=ys>=2020; print("mean LST-TS 2020-25",d[m].mean().round(2),"2001-19",d[~m].mean().round(2))
