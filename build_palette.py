#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Port of palette.mjs (design-for-hosza) — OKLCH ramps, WCAG by construction.
Seeded from UEM Edgenta blue. Emits CSS tokens + contrast report for the app."""
import math

def oklch_to_srgb(L, C, Hdeg):
    h = Hdeg*math.pi/180; a = C*math.cos(h); b = C*math.sin(h)
    l_ = L+0.3963377774*a+0.2158037573*b
    m_ = L-0.1055613458*a-0.0638541728*b
    s_ = L-0.0894841775*a-1.291485548*b
    l=l_**3; m=m_**3; s=s_**3
    out=[4.0767416621*l-3.3077115913*m+0.2309699292*s,
         -1.2684380046*l+2.6097574011*m-0.3413193965*s,
         -0.0041960863*l-0.7034186147*m+1.707614701*s]
    return [(12.92*x if x<=0.0031308 else 1.055*(max(x,0)**(1/2.4))-0.055) for x in out]

def srgb_to_oklch(r,g,b):
    lin=[(x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4) for x in (r,g,b)]
    l=0.4122214708*lin[0]+0.5363325363*lin[1]+0.0514459929*lin[2]
    m=0.2119034982*lin[0]+0.6806995451*lin[1]+0.1073969566*lin[2]
    s=0.0883024619*lin[0]+0.2817188376*lin[1]+0.6299787005*lin[2]
    l_=l**(1/3); m_=m**(1/3); s_=s**(1/3)
    L=0.2104542553*l_+0.793617785*m_-0.0040720468*s_
    a=1.9779984951*l_-2.428592205*m_+0.4505937099*s_
    bb=0.0259040371*l_+0.7827717662*m_-0.808675766*s_
    C=math.hypot(a,bb); H=math.atan2(bb,a)*180/math.pi
    if H<0: H+=360
    return L,C,H

def in_gamut(rgb): return all(-1e-6<=x<=1+1e-6 for x in rgb)

def to_gamut(L,C,H):
    rgb=oklch_to_srgb(L,C,H)
    if in_gamut(rgb): return (L,C,H,rgb)
    lo,hi=0,C
    for _ in range(24):
        mid=(lo+hi)/2; rgb=oklch_to_srgb(L,mid,H)
        if in_gamut(rgb): lo=mid
        else: hi=mid
    return (L,lo,H,oklch_to_srgb(L,lo,H))

def to_hex(rgb): return "#"+"".join("%02x"%round(min(1,max(0,x))*255) for x in rgb)
def parse_hex(s):
    m=s.replace("#",""); v="".join(c+c for c in m) if len(m)==3 else m
    return [int(v[i:i+2],16)/255 for i in (0,2,4)]

def luminance(rgb):
    c=[min(1,max(0,x)) for x in rgb]
    c=[(x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4) for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def contrast(a,b):
    x,y=sorted([luminance(a),luminance(b)],reverse=True); return (x+0.05)/(y+0.05)

def cusp(H):
    best=(0.63,0); L=0.35
    while L<=0.88:
        lo,hi=0,0.4
        for _ in range(18):
            mid=(lo+hi)/2
            if in_gamut(oklch_to_srgb(L,mid,H)): lo=mid
            else: hi=mid
        if lo>best[1]: best=(L,lo)
        L+=0.01
    return best

CHROMA_MULT={"muted":0.45,"balanced":0.7,"vivid":1.0}
CHROMA_PROFILE=[0.06,0.1,0.22,0.32,0.44,0.56,0.68,0.82,1.0,0.95,0.6,0.35]
L_LIGHT=[0.993,0.981,0.956,0.93,0.9,0.864,0.818,0.74,None,None,0.5,0.3]

def solve_text(L0,C0,H,bg,target,dir):
    L,C=L0,C0
    for _ in range(3):
        l=L
        while 0.05<=l<=0.985:
            g=to_gamut(l,C,H)
            if contrast(g[3],bg)>=target: return g
            l+=dir*0.005
        C*=0.55
    return to_gamut(0.05 if dir<0 else 0.985,0,H)

def ramp(H,chromaKey,neutral=False):
    cuspL,cuspC=cusp(H); mult=CHROMA_MULT[chromaKey]
    peak=min(0.018,cuspC) if neutral else min(cuspC*mult,0.26)
    Lspec=L_LIGHT[:]
    solidL=min(0.78,max(0.5,cuspL)); Lspec[8]=solidL; Lspec[9]=solidL-0.06
    steps=[to_gamut(L,peak*CHROMA_PROFILE[i],H) for i,L in enumerate(Lspec)]
    bg=steps[1][3]
    steps[10]=solve_text(Lspec[10],steps[10][1],H,bg,4.5,-1)
    steps[11]=solve_text(Lspec[11],steps[11][1],H,bg,7.0,-1)
    white=to_gamut(0.985,min(0.012,peak),H); black=to_gamut(0.16,min(0.02,peak),H)
    onSolid=white if contrast(white[3],steps[8][3])>=4.5 else black
    return steps,onSolid

SEED="#1e3a8a"
L,C,H=srgb_to_oklch(*parse_hex(SEED))
print(f"// seed {SEED} -> oklch L={L:.3f} C={C:.3f} H={H:.1f}")
neutral,_=ramp(H,"balanced",neutral=True)
accent,acc_on=ramp(H,"balanced",neutral=False)
print("\nNEUTRAL ramp (blue-tinted):")
for i,g in enumerate(neutral): print(f"  neutral-{i+1:>2}: {to_hex(g[3])}")
print("\nACCENT ramp (brand blue):")
for i,g in enumerate(accent): print(f"  accent-{i+1:>2}: {to_hex(g[3])}")
print("  accent-on-solid:", to_hex(acc_on[3]))

# Functional hues (error/success/warning) chroma-matched, contrast-checked text+solid
FUNC={"error":25,"success":145,"warning":85}
print("\nFUNCTIONAL (3=bg,9=solid,11=text):")
for name,h in FUNC.items():
    st,_=ramp(h,"balanced",neutral=False)
    print(f"  {name}: bg={to_hex(st[2][3])} solid={to_hex(st[8][3])} text={to_hex(st[10][3])}")

# Contrast report for the key field-readability pairs
white_rgb=neutral[0][3]; surf=neutral[1][3]
def rep(label,fg,bg,t):
    c=contrast(fg,bg); print(f"  {'PASS' if c>=t else 'FAIL'}  {label}: {c:.2f}:1 (>= {t})")
print("\nCONTRAST REPORT:")
rep("neutral-11 (label/secondary) on white", neutral[10][3], white_rgb, 4.5)
rep("neutral-12 (body) on white", neutral[11][3], white_rgb, 7.0)
rep("accent-11 (blue text) on white", accent[10][3], white_rgb, 4.5)
rep("accent-on-solid on accent-9 (blue button)", acc_on[3], accent[8][3], 4.5)
