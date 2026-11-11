import numpy as np, glob, json, cv2
fs=sorted(glob.glob('fr/*.png')); R=json.load(open('analysis.json'))
C={
 "woman":{"base":61,"mouth":(676,388,726,432),"eyes":(652,340,748,380)},
 "man":{"base":161,"mouth":(1268,362,1326,408),"eyes":(1246,300,1350,344)},
}
def aligned(i,dx,dy):
    img=cv2.imread(fs[i-1]); M=np.float32([[1,0,-dx],[0,1,-dy]])
    return cv2.warpAffine(img,M,(img.shape[1],img.shape[0]),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
picks={}
for name,c in C.items():
    rs=R[name]; o=np.array([r["open"] for r in rs]); resp=np.array([r["resp"] for r in rs])
    def best(lo,hi):
        idx=[k for k in range(len(rs)) if lo<=o[k]<=hi]
        return max(idx,key=lambda k:resp[k]) if idx else None
    q=np.percentile(o,[40,55,70,80,88,95,99.5])
    levels={"slight":best(q[1],q[2]),"mid":best(q[3],q[4]),"wide":best(q[5],q[6])}
    e=np.array([r["eye"] for r in rs]); blink=int(np.argmin(e))
    picks[name]={k:(rs[v]["i"] if v is not None else None) for k,v in levels.items()}; picks[name]["blink"]=rs[blink]["i"]
    sheet=[]
    x0,y0,x1,y1=c["mouth"]; pad=12
    base=cv2.imread(fs[c["base"]-1])
    sheet.append(cv2.resize(base[y0-pad:y1+pad,x0-pad:x1+pad],None,fx=4,fy=4))
    for k,v in levels.items():
        r=rs[v]; a=aligned(r["i"],r["dx"],r["dy"])
        sheet.append(cv2.resize(a[y0-pad:y1+pad,x0-pad:x1+pad],None,fx=4,fy=4))
    ex0,ey0,ex1,ey1=c["eyes"]; r=rs[blink]; a=aligned(r["i"],r["dx"],r["dy"])
    eb=cv2.resize(a[ey0:ey1,ex0:ex1],(sheet[0].shape[1],int(sheet[0].shape[1]*(ey1-ey0)/(ex1-ex0))))
    eo=cv2.resize(base[ey0:ey1,ex0:ex1],eb.shape[1::-1])
    cv2.imwrite(f'{name}_mouths.png',np.hstack(sheet)); cv2.imwrite(f'{name}_eyes.png',np.vstack([eo,eb]))
print(json.dumps(picks))
json.dump(picks,open('picks.json','w'))
