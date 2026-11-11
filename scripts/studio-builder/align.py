import cv2, numpy as np
def load(p): return cv2.imread(p)
def ecc(ref, img, scale=0.25):
    g1=cv2.cvtColor(cv2.resize(ref,None,fx=scale,fy=scale),cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    g2=cv2.cvtColor(cv2.resize(img,None,fx=scale,fy=scale),cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    if g2.shape!=g1.shape: g2=cv2.resize(g2,(g1.shape[1],g1.shape[0]))
    W=np.eye(2,3,dtype=np.float32)
    # initial guess for differing sizes
    sx=ref.shape[1]/img.shape[1]; 
    crit=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,300,1e-6)
    cc,W=cv2.findTransformECC(g1,g2,W,cv2.MOTION_AFFINE,crit,None,5)
    W[:,2]/=scale
    return cc,W
for who,ref_name in [("man","man_eh"),("woman","woman_base")]:
    ref=load(f"{ref_name}.jpg"); H,Wd=ref.shape[:2]
    for v in ["base","eh","ah","laugh","blink"]:
        img=load(f"{who}_{v}.jpg")
        if img.shape[:2]!=ref.shape[:2]:
            img=cv2.resize(img,(img.shape[1],img.shape[0]))  # keep pixel scale; ECC handles offset
            pad=np.full((max(H,img.shape[0]),max(Wd,img.shape[1]),3),205,np.uint8); pad[:img.shape[0],:img.shape[1]]=img; img=pad[:H,:Wd] if pad.shape[0]>=H else pad
        cc,M=ecc(ref,img)
        out=cv2.warpAffine(img,M,(Wd,H),flags=cv2.INTER_CUBIC|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REPLICATE)
        cv2.imwrite(f"al_{who}_{v}.png",out)
        print(who,v,round(cc,4),np.round(M,3).tolist())
