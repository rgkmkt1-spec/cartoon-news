from rembg import remove, new_session
from PIL import Image
s=new_session("isnet-general-use")
for who in ["man","woman"]:
    im=Image.open(f"al_{who}_base.png").convert("RGB")
    remove(im, session=s).save(f"{who}_base_cut.png")
    print(who,"ok")
