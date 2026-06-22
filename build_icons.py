#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jana ikon PWA — UEM Edgenta (globe wireframe design).
Requires: pip install Pillow
Output  : icon-192.png, icon-512.png, icon-maskable-512.png, icon-github.png
"""
import math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

try:
    from PIL import Image, ImageDraw, ImageFont, ImageChops
except ImportError:
    sys.exit("ERROR: Pillow diperlukan.  Jalankan:  pip install Pillow")

# ── Palet warna ──────────────────────────────────────────────────────────────
BG_DARK   = (9,  26,  60)       # #091a3c  — tepi latar
BG_LIGHT  = (31, 77,  144)      # #1f4d90  — tengah latar
BADGE_COL = (29, 85,  208)      # #1d55d0  — latar EDGENTA
WHITE     = (255, 255, 255, 255)

# ── Cari font bold sistem ─────────────────────────────────────────────────────
def _font(size):
    for path in [
        r"C:\Windows\Fonts\ariblk.ttf",   # Arial Black (Windows)
        r"C:\Windows\Fonts\arialbd.ttf",  # Arial Bold  (Windows)
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

# ── Reka bentuk ikon ──────────────────────────────────────────────────────────
def make_icon(size: int, maskable: bool = False) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Radius penjuru luar
    r_outer = int(s * 0.211)

    # 1) Latar gradien (pekat di tepi, cerah di tengah)
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=r_outer,
                            fill=BG_DARK + (255,))
    cx, cy_grad = s // 2, int(s * 0.40)
    for step in range(50, 0, -1):
        t = step / 50
        er = int(s * 0.72 * t)
        col = tuple(int(BG_LIGHT[i] + (BG_DARK[i] - BG_LIGHT[i]) * (1 - t ** 0.55))
                    for i in range(3))
        alpha = int(170 * (1 - t ** 1.6))
        draw.ellipse([cx - er, cy_grad - int(er * 0.82),
                      cx + er, cy_grad + int(er * 0.82)],
                     fill=col + (alpha,))

    # Terapkan mask penjuru bulat pada latar
    mask_bg = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask_bg).rounded_rectangle([0, 0, s - 1, s - 1],
                                              radius=r_outer, fill=255)
    img.putalpha(mask_bg)
    draw = ImageDraw.Draw(img)

    # 2) Glob wayar —  zon selamat ikon maskable (inset 10%)
    inset = int(s * 0.10) if maskable else 0
    gc_x  = s // 2
    gc_y  = int(s * 0.516)
    gc_r  = int(s * 0.293) - inset
    eq_ry = int(gc_r * 0.267)          # mampatan ekuatorial
    stroke = max(1, s // 256)

    # Lukis wayar pada lapisan telus
    wire = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wire)
    wc = (255, 255, 255, 205)           # putih ~80% legap

    def lat_line(deg):
        rad = math.radians(deg)
        oy  = int(gc_r  * math.sin(rad))
        rx  = int(gc_r  * math.cos(rad))
        ry  = int(eq_ry * math.cos(rad))
        if rx > 2 and ry > 0:
            wd.ellipse([gc_x - rx, gc_y - oy - ry,
                        gc_x + rx, gc_y - oy + ry],
                       outline=wc, width=stroke)

    def lon_line(deg):
        rx = int(gc_r * math.sin(math.radians(deg)))
        if rx > 2:
            wd.ellipse([gc_x - rx, gc_y - gc_r,
                        gc_x + rx, gc_y + gc_r],
                       outline=wc, width=stroke)

    for d in [0, 30, 60, -30, -60]:
        lat_line(d)
    for d in [20, 52]:
        lon_line(d)

    # Potong wayar kepada sempadan bulat glob
    gm = Image.new("L", (s, s), 0)
    ImageDraw.Draw(gm).ellipse([gc_x - gc_r, gc_y - gc_r,
                                gc_x + gc_r, gc_y + gc_r], fill=255)
    r_, g_, b_, a_ = wire.split()
    wire.putalpha(ImageChops.multiply(a_, gm))
    img = Image.alpha_composite(img, wire)
    draw = ImageDraw.Draw(img)

    # Bulatan luar glob
    draw.ellipse([gc_x - gc_r, gc_y - gc_r,
                  gc_x + gc_r, gc_y + gc_r],
                 outline=(255, 255, 255, 235), width=stroke + 1)

    # 3) Teks "UEM"
    uem_sz = int(s * 0.172)
    uem_y  = int(s * 0.215)
    draw.text((s // 2, uem_y), "UEM", fill=WHITE,
              font=_font(uem_sz), anchor="mm")

    # 4) Lencana "EDGENTA"
    badge_y  = int(s * 0.877)
    badge_h  = int(s * 0.098)
    badge_w  = int(s * 0.590)
    bx0 = s // 2 - badge_w // 2
    bx1 = s // 2 + badge_w // 2
    draw.rounded_rectangle([bx0, badge_y - badge_h // 2,
                             bx1, badge_y + badge_h // 2],
                            radius=badge_h // 2,
                            fill=BADGE_COL + (255,))
    draw.text((s // 2, badge_y), "EDGENTA", fill=WHITE,
              font=_font(int(s * 0.052)), anchor="mm")

    return img


def save(img: Image.Image, path: str):
    img.save(path, "PNG")
    print("wrote", os.path.basename(path))


if __name__ == "__main__":
    configs = [
        ("icon-192.png",          192, False),
        ("icon-512.png",          512, False),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, mask in configs:
        save(make_icon(size, maskable=mask), os.path.join(HERE, name))
