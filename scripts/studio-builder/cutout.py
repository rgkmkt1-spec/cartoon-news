import numpy as np, cv2
from rembg import remove, new_session
from PIL import Image
sess=new_session("isnet-general-use")
def cut(frame, box, name):
    im=Image.open(f'fr/{frame:04d}.png').convert('RGB')
    crop=im.crop(box)
    out=remove(crop, session=sess)
    out.save(f'{name}_cut.png')
    a=np.asarray(out)[...,3]
    print(name, out.size, 'alpha>0 frac', (a>128).mean().round(3))
cut(61,(520,220,880,630),'woman')
cut(161,(1080,180,1530,630),'man')
