import numpy as np, cv2
frame=cv2.imread('fr/0061.png')
H,W=frame.shape[:2]
mask=np.zeros((H,W),np.uint8)
for name,(x0,y0) in {"woman":(520,220),"man":(1080,180)}.items():
    a=cv2.imread(f'{name}_cut.png',cv2.IMREAD_UNCHANGED)[...,3]
    m=(a>20).astype(np.uint8)*255
    mask[y0:y0+m.shape[0], x0:x0+m.shape[1]] |= m
mask=cv2.dilate(mask,np.ones((25,25),np.uint8))
mask[612:,:]=0   # keep the desk itself untouched
# also cover where the head moves (from the motion map), above the desk
mask[240:480,570:850]=np.maximum(mask[240:480,570:850], 0)
# "AI" watermarks
for (cx,cy) in [(990,600),(1032,600),(387,596)]:
    mask[cy-12:cy+12,cx-16:cx+16]=255
plate=cv2.inpaint(frame,mask,9,cv2.INPAINT_TELEA)
cv2.imwrite('plate.png',plate)
cv2.imwrite('plate_small.png',cv2.resize(plate,(1280,720)))
