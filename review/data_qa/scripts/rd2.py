import numpy as np, json, datetime as dt
R="<repo>/"
rows=json.load(open("reread_B_time.json")); z=dict(np.load('reread_B.npz')); d=np.load(R+"data/C-B/monthly.npz")
z['cube']=z['cube'].reshape(100,80,420)
ep=dt.datetime(1980,1,6); bad=0; shown=[]
for y,m,ur,tv,u,_ in rows:
    t=ep+dt.timedelta(seconds=int(tv[0]))
    ok=(t.year==y and t.month==m)  # representative time = mid-month
    bad+= (not ok); 
    if len(shown)<3 or not ok: shown.append((y,m,str(t)))
print("time-variable mismatches",bad, shown[:6]); print(len(rows),"unique times",len({r[3][0] for r in rows}))
print("max abs diff reread vs data/C-B cube",np.nanmax(np.abs(z['cube']-d['values'])), "nan equal",np.array_equal(np.isnan(z['cube']),np.isnan(d['values'])), "lat equal",np.allclose(z['lat'],d['lat']))
print("order same",np.array_equal(z['year'],d['year']),np.array_equal(z['month'],d['month']))
# global sanity: box ocean fraction? cells near zero
print("share of cells with 0 rain Aug", (d['values'][2]==0).mean())
