import numpy as np, cv2, json, glob
fs=sorted(glob.glob('fr/*.png')); R=json.load(open('analysis.json')); P=json.load(open('picks.json'))
OUT='/home/claude/cartoon-news/public/studio'
cv2.imwrite(f'{OUT}/plate.jpg', cv2.imread('plate.png'), [cv2.IMWRITE_JPEG_QUALITY, 93])

C={
 # speaker A = man (right), B = woman (left)
 "A":{"name":"man","origin":(1080,180),"base":161,"mouth":(1268,362,1326,408),"eyes":(1246,300,1350,344),"neckY":(408,432),"pivot":(1300,440)},
 "B":{"name":"woman","origin":(520,220),"base":61,"mouth":(676,388,726,432),"eyes":(652,340,748,380),"neckY":(452,476),"pivot":(700,480)},
}
def aligned(i,dx,dy):
    img=cv2.imread(fs[i-1]); M=np.float32([[1,0,-dx],[0,1,-dy]])
    return cv2.warpAffine(img,M,(img.shape[1],img.shape[0]),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
def feather_ellipse(w,h,soft=0.35):
    yy,xx=np.mgrid[0:h,0:w]; nx=(xx-(w-1)/2)/(w/2); ny=(yy-(h-1)/2)/(h/2); r=np.sqrt(nx**2+ny**2)
    return np.clip((1-r)/soft,0,1)
def save_rgba(path,bgr,alpha):
    rgba=np.dstack([bgr,(alpha*255).astype(np.uint8)]); cv2.imwrite(path,rgba)
meta={"plate":"studio/plate.jpg","screen":{"x":802,"y":348,"w":443,"h":222},"anchors":{}}
for sp,c in C.items():
    n=c["name"]; ox,oy=c["origin"]
    cut=cv2.imread(f'{n}_cut.png',cv2.IMREAD_UNCHANGED); h,w=cut.shape[:2]
    cv2.imwrite(f'{OUT}/{n}_body.png',cut)
    # head layer: same cutout faded out below the neck line
    a=cut[...,3].astype(np.float32)/255
    y0,y1=c["neckY"]; ys=np.arange(h)[:,None]+oy
    fade=np.clip((y1-ys)/(y1-y0),0,1)
    save_rgba(f'{OUT}/{n}_head.png',cut[...,:3],a*fade)
    rs={r["i"]:r for r in R[n]}
    mx0,my0,mx1,my1=c["mouth"]; pad=14; X0,Y0,X1,Y1=mx0-pad,my0-pad,mx1+pad,my1+pad+6
    mouths={}
    for lvl in ["slight","mid","wide"]:
        i=P[n][lvl]; r=rs[i]; img=aligned(i,r["dx"],r["dy"])
        save_rgba(f'{OUT}/{n}_mouth_{lvl}.png',img[Y0:Y1,X0:X1],feather_ellipse(X1-X0,Y1-Y0,0.45))
        mouths[lvl]=f'studio/{n}_mouth_{lvl}.png'
    ex0,ey0,ex1,ey1=c["eyes"]; i=P[n]["blink"]; r=rs[i]; img=aligned(i,r["dx"],r["dy"])
    save_rgba(f'{OUT}/{n}_blink.png',img[ey0:ey1,ex0:ex1],feather_ellipse(ex1-ex0,ey1-ey0,0.5))
    meta["anchors"][sp]={
        "body":f"studio/{n}_body.png","head":f"studio/{n}_head.png","x":ox,"y":oy,"w":w,"h":h,
        "pivot":c["pivot"],"mouth":{"x":X0,"y":Y0,"w":X1-X0,"h":Y1-Y0,**mouths},
        "blink":{"src":f"studio/{n}_blink.png","x":ex0,"y":ey0,"w":ex1-ex0,"h":ey1-ey0},
    }
meta["close"]={"A":{"fx":1300,"fy":400,"cx":940,"cy":520,"s":2.2},"B":{"fx":700,"fy":420,"cx":980,"cy":520,"s":2.2}}
json.dump(meta,open(f'{OUT}/studio.json','w'),indent=1)
print(json.dumps(meta)[:400])
