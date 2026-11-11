import numpy as np, glob, json, cv2
fs=sorted(glob.glob('fr/*.png'))
C={
 "woman":{"base":61,"head":(580,250,840,470),"mouth":(676,388,726,432),"eyes":[(660,350,688,372),(711,348,739,370)]},
 "man":{"base":161,"head":(1215,205,1385,425),"mouth":(1268,362,1326,408),"eyes":[(1254,312,1288,336),(1306,310,1340,334)]},
}
def gray(i): return cv2.imread(fs[i-1],cv2.IMREAD_GRAYSCALE).astype(np.float32)
res={}
for name,c in C.items():
    x0,y0,x1,y1=c["head"]; mx0,my0,mx1,my1=c["mouth"]
    base=gray(c["base"])[y0:y1,x0:x1].copy()
    mask=np.ones_like(base); mask[my0-y0-6:my1-y0+6, mx0-x0-6:mx1-x0+6]=0
    win=cv2.createHanningWindow((x1-x0,y1-y0),cv2.CV_32F)
    out=[]
    for i in range(1,len(fs)+1):
        g=gray(i)[y0:y1,x0:x1]
        (dx,dy),resp=cv2.phaseCorrelate(base*mask,g*mask,win)
        # openness: dark pixel fraction in shifted mouth box
        img=cv2.imread(fs[i-1])
        sx,sy=int(round(dx)),int(round(dy))
        m=img[my0+sy:my1+sy, mx0+sx:mx1+sx]
        hsv=cv2.cvtColor(m,cv2.COLOR_BGR2HSV)
        v=hsv[...,2].astype(np.float32); s=hsv[...,1].astype(np.float32)
        dark=(v<95).mean(); teeth=((v>200)&(s<60)).mean()
        eyes=[]
        for ex0,ey0,ex1,ey1 in c["eyes"]:
            e=cv2.cvtColor(img[ey0+sy:ey1+sy, ex0+sx:ex1+sx],cv2.COLOR_BGR2GRAY).astype(np.float32)
            eyes.append(float(e.std()))
        out.append({"i":i,"dx":dx,"dy":dy,"resp":resp,"open":float(dark+teeth),"dark":float(dark),"teeth":float(teeth),"eye":float(np.mean(eyes))})
    res[name]=out
    o=np.array([r["open"] for r in out]); e=np.array([r["eye"] for r in out]); d=np.array([[r["dx"],r["dy"]] for r in out])
    print(name,"open pct",np.percentile(o,[0,10,25,50,75,90,100]).round(3),"eye pct",np.percentile(e,[0,5,50,100]).round(1),"shift max",np.abs(d).max(0).round(1))
json.dump(res,open('analysis.json','w'))
