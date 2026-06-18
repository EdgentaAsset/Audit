#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jana ikon PWA (PNG) tanpa Pillow — latar biru #1e3a8a + tanda semak putih.
Output: icon-192.png, icon-512.png, icon-maskable-512.png
"""
import struct
import zlib
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BLUE = (30, 58, 138)      # #1e3a8a
WHITE = (255, 255, 255)


def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def make_png(size, maskable=False):
    s = size
    # Tanda semak (checkmark) — koordinat relatif kepada saiz
    inset = 0.30 if maskable else 0.24   # zon selamat utk maskable
    p1 = (s * (0.30 + inset * 0.0), s * 0.52)
    p2 = (s * 0.45, s * 0.66)
    p3 = (s * 0.72, s * 0.36)
    stroke = s * 0.075
    half = stroke / 2.0
    raw = bytearray()
    for y in range(s):
        raw.append(0)  # filter type 0
        for x in range(s):
            px, py = x + 0.5, y + 0.5
            d = min(dist_seg(px, py, *p1, *p2), dist_seg(px, py, *p2, *p3))
            # anti-alias 1px
            a = max(0.0, min(1.0, (half + 0.75 - d) / 1.5))
            r = int(BLUE[0] + (WHITE[0] - BLUE[0]) * a)
            g = int(BLUE[1] + (WHITE[1] - BLUE[1]) * a)
            b = int(BLUE[2] + (WHITE[2] - BLUE[2]) * a)
            raw += bytes((r, g, b))
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
        return c

    ihdr = struct.pack(">IIBBBBB", s, s, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + \
        chunk(b"IDAT", comp) + chunk(b"IEND", b"")
    return png


for name, size, mask in [("icon-192.png", 192, False),
                         ("icon-512.png", 512, False),
                         ("icon-maskable-512.png", 512, True)]:
    with open(os.path.join(HERE, name), "wb") as f:
        f.write(make_png(size, mask))
    print("wrote", name)
