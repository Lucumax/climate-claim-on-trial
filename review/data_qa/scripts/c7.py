import numpy as np, scipy.stats as st
z=np.load("reread_A.npz"); ys=np.arange(2001,2026); y=z['year']
def pop(a):
    a=a.astype(np.uint32); c=np.zeros(a.shape,np.int16)
    for b in range(32): c+=((a>>b)&1).astype(np.int16)
    return c
cl=np.stack([pop(z['clear'][i]) for i in range(75)])
C=np.where(z['day']>0,z['day']*0.02-273.15,np.nan)
w=np.cos(np.deg2rad(z['lat']))[:,None]*np.ones(290)
print("clear-day count distribution among valid cells: min",cl[z['day']>0].min(),"p5",np.percentile(cl[z['day']>0],5),"median",np.median(cl[z['day']>0]))
for thr in (0,3,5,10):
    s=[]
    for i in range(75):
        ok=np.isfinite(C[i])&(cl[i]>=thr); s.append((C[i][ok]*w[ok]).sum()/w[ok].sum())
    s=np.array(s); j=np.array([s[y==yy].mean() for yy in ys]); print("clear days >=",thr,"Sen/dec",round(st.theilslopes(j,ys)[0]*10,3))
print("QC_Day not fetched")
