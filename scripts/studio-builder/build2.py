import cv2, numpy as np, json
OUT='/home/claude/cartoon-news/public/studio'
plate=cv2.imread('/home/claude/charref/plate.png'); cv2.imwrite(f'{OUT}/plate.jpg',plate,[cv2.IMWRITE_JPEG_QUALITY,93])
DESK=615
C={
 # A = man (right), B = woman (left). s = placement scale into the 1920x1080 frame
 "A":{"n":"man","s":0.31,"eyeNew":(1010,733),"eyeOld":(1296,322),"mouth":(895,870,1150,1070),"lower":(760,840,1260,1100),"eyes":(780,630,1240,810),"neck":(1040,1085),"lip":(780,640,1220,1080)},
 "B":{"n":"woman","s":0.25,"eyeNew":(1043,616),"eyeOld":(704,359),"mouth":(935,755,1175,925),"lower":(860,725,1230,950),"eyes":(830,540,1260,695),"neck":(990,1060),"lip":(800,470,1290,960)},
}
K=2.4  # store layers 2.4x larger than shown -> sharp close-ups
def feather(w,h,soft):
    yy,xx=np.mgrid[0:h,0:w]; r=np.sqrt(((xx-(w-1)/2)/(w/2))**2+((yy-(h-1)/2)/(h/2))**2)
    return np.clip((1-r)/soft,0,1)
meta={"plate":"studio/plate.jpg","screen":{"x":802,"y":348,"w":443,"h":222},"anchors":{},"close":{}}
for sp,c in C.items():
    n=c["n"]; s=c["s"]
    ox=c["eyeOld"][0]-c["eyeNew"][0]*s; oy=c["eyeOld"][1]-c["eyeNew"][1]*s
    cut=cv2.imread(f'{n}_base_cut.png',cv2.IMREAD_UNCHANGED)
    ycut=int((DESK-oy)/s)                       # rows below this are hidden by the desk
    a=cut[...,3]; ys,xs=np.where(a[:ycut]>10)
    x0,x1,y0=max(0,xs.min()-4),min(cut.shape[1],xs.max()+4),max(0,ys.min()-4)
    region=cut[y0:ycut,x0:x1]
    ss=s*K
    def store(img): return cv2.resize(img,(int(img.shape[1]*ss),int(img.shape[0]*ss)),interpolation=cv2.INTER_AREA)
    body=store(region); cv2.imwrite(f'{OUT}/{n}_body.png',body)
    alpha=region[...,3].astype(np.float32)/255
    ny0,ny1=c["neck"]; yy=(np.arange(region.shape[0])+y0)[:,None]
    head=region.copy(); head[...,3]=(alpha*np.clip((ny1-yy)/(ny1-ny0),0,1)*255).astype(np.uint8)
    cv2.imwrite(f'{OUT}/{n}_head.png',store(head))
    X=lambda x: ox+x*s; Y=lambda y: oy+y*s
    # mouth + blink sprites from the aligned edits
    mx0,my0,mx1,my1=c["mouth"]; mouth={}
    for lvl,src in [("slight","eh"),("mid","ah"),("wide","ah"),("laugh","laugh")]:
        img=cv2.imread(f'al_{n}_{src}.png')[my0:my1,mx0:mx1]
        rgba=np.dstack([img,(feather(mx1-mx0,my1-my0,0.55)*255).astype(np.uint8)])
        cv2.imwrite(f'{OUT}/{n}_mouth_{lvl}.png',store(rgba)); mouth[lvl]=f'studio/{n}_mouth_{lvl}.png'
    # whole-head variants (talking face, laughing face) using the base silhouette
    heads={}
    for key,src in [("talk","eh"),("laugh","laugh")]:
        v=cv2.imread(f'al_{n}_{src}.png')[y0:ycut,x0:x1]
        hv=np.dstack([v,head[...,3]])
        cv2.imwrite(f'{OUT}/{n}_head_{key}.png',store(hv)); heads[key]=f'studio/{n}_head_{key}.png'
    # lower-face sprites: open jaw ("ah") and closed lips (base) for m/b/p
    lx0,ly0,lx1,ly1=c["lower"]; lower={}
    for key,src in [("ah","ah"),("closed","base")]:
        img=cv2.imread(f'al_{n}_{src}.png')[ly0:ly1,lx0:lx1]
        rgba=np.dstack([img,(feather(lx1-lx0,ly1-ly0,0.4)*255).astype(np.uint8)])
        cv2.imwrite(f'{OUT}/{n}_lower_{key}.png',store(rgba)); lower[key]=f'studio/{n}_lower_{key}.png'
    # AI lip sync: reference face (talking face) + where the redrawn mouth patch goes
    PR=(0.15,0.47,0.85,0.97)
    lx0_,ly0_,lx1_,ly1_=c["lip"]; LS=lx1_-lx0_
    cv2.imwrite(f'{OUT}/{n}_lipref.png',cv2.imread(f'al_{n}_eh.png')[ly0_:ly1_,lx0_:lx1_])
    pw,ph=int(LS*(PR[2]-PR[0])*ss)//2*2,int(LS*(PR[3]-PR[1])*ss)//2*2
    lip={"ref":f"studio/{n}_lipref.png","box":[0,0,LS,LS],"patch":list(PR),"size":[pw,ph],
         "x":round(X(lx0_+LS*PR[0]),1),"y":round(Y(ly0_+LS*PR[1]),1),"w":round(LS*(PR[2]-PR[0])*s,1),"h":round(LS*(PR[3]-PR[1])*s,1)}
    ex0,ey0,ex1,ey1=c["eyes"]
    img=cv2.imread(f'al_{n}_blink.png')[ey0:ey1,ex0:ex1]
    cv2.imwrite(f'{OUT}/{n}_blink.png',store(np.dstack([img,(feather(ex1-ex0,ey1-ey0,0.45)*255).astype(np.uint8)])))
    meta["anchors"][sp]={"body":f"studio/{n}_body.png","head":f"studio/{n}_head.png",
        "x":round(X(x0),1),"y":round(Y(y0),1),"w":round((x1-x0)*s,1),"h":round((ycut-y0)*s,1),
        "pivot":[round(X((x0+x1)/2),1),round(Y(ny1),1)],
        "mouth":{"x":round(X(mx0),1),"y":round(Y(my0),1),"w":round((mx1-mx0)*s,1),"h":round((my1-my0)*s,1),**mouth},
        "talkHead":heads["talk"],"lip":lip,"laughHead":heads["laugh"],
        "lower":{"x":round(X(lx0),1),"y":round(Y(ly0),1),"w":round((lx1-lx0)*s,1),"h":round((ly1-ly0)*s,1),**lower},
        "blink":{"src":f"studio/{n}_blink.png","x":round(X(ex0),1),"y":round(Y(ey0),1),"w":round((ex1-ex0)*s,1),"h":round((ey1-ey0)*s,1)}}
    hx,hy=c["eyeOld"]
    meta["close"][sp]={"fx":1296,"fy":362,"cx":860,"cy":520,"s":1.9} if sp=="A" else {"fx":hx,"fy":hy+40,"cx":980,"cy":520,"s":2.2}
    print(sp,n,"origin",round(ox),round(oy),"layer",body.shape)
json.dump(meta,open(f'{OUT}/studio.json','w'),indent=1)
