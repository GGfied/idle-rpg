#!/usr/bin/env python3
"""Generates the 32x32 item icons in ../items/*.svg. ONE source per item: the inventory slot and the
ground sprite both load that same SVG (render/itemIcons.ts). Run: python3 gen_items.py [outdir]
Pure stdlib. Shading is computed per pixel (cylinder / sphere lighting from the top-left, hash noise
for bark, grain and rock facets); a 1px dark outline is added around the opaque pixels."""
import math, os, sys

N = 32
Color = tuple


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    t = clamp(t)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(cols, t):
    """Piecewise colour ramp over t in 0..1 (cols dark -> light)."""
    t = clamp(t) * (len(cols) - 1)
    i = min(int(t), len(cols) - 2)
    return mix(cols[i], cols[i + 1], t - i)


def noise(x, y, seed=0):
    h = (int(x) * 73856093) ^ (int(y) * 19349663) ^ (seed * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


class Img:
    def __init__(self):
        self.p = {}

    def set(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.p[(x, y)] = c

    def paint(self, fn, rot=0.0, cx=16.0, cy=16.0):
        """fn(x, y) -> colour|None evaluated at pixel centres of the (optionally rotated) frame."""
        ca, sa = math.cos(rot), math.sin(rot)
        for y in range(N):
            for x in range(N):
                px, py = x + 0.5 - cx, y + 0.5 - cy
                c = fn(cx + px * ca + py * sa, cy - px * sa + py * ca)
                if c:
                    self.p[(x, y)] = c

    def outline(self, col, diag=False):
        add = {}
        for (x, y) in self.p:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (-1, -1), (1, -1), (-1, 1)) if diag else ()):
                q = (x + dx, y + dy)
                if q not in self.p and 0 <= q[0] < N and 0 <= q[1] < N:
                    add[q] = col
        self.p.update(add)

    def svg(self):
        by = {}
        for (x, y), c in self.p.items():
            by.setdefault(c, []).append((x, y))
        out = []
        for c, pts in sorted(by.items(), key=lambda kv: -len(kv[1])):
            pts.sort(key=lambda q: (q[1], q[0]))
            d, i = [], 0
            while i < len(pts):
                x, y = pts[i]
                j = i
                while j + 1 < len(pts) and pts[j + 1] == (pts[j][0] + 1, y):
                    j += 1
                d.append(f'M{x} {y}h{j - i + 1}v1h-{j - i + 1}z')
                i = j + 1
            out.append(f'<path fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}" d="{"".join(d)}"/>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" '
                f'shape-rendering="crispEdges">{"".join(out)}</svg>')


# ---------------------------------------------------------------- shared shading pieces
WOOD = [hx(s) for s in ('#3b2412', '#5e3b1d', '#855830', '#a87a45', '#cda06a')]


def seg_uv(x, y, ox, oy, ang):
    """(u, v) of a point in a frame whose u axis points at `ang` (screen radians, y down)."""
    dx, dy = x - ox, y - oy
    return dx * math.cos(ang) + dy * math.sin(ang), -dx * math.sin(ang) + dy * math.cos(ang)


def haft(x, y, ox, oy, ang, length, half=1.6, wood=WOOD, seed=1):
    """Round wooden haft along (ox,oy)+u*dir. v>0 is the lit (upper-left) side."""
    u, v = seg_uv(x, y, ox, oy, ang)
    if u < -0.3 or u > length or abs(v) > half:
        return None
    t = v / half  # -1..1, +1 = lit side
    lum = 0.50 + 0.38 * t - 0.12 * t * t
    grain = noise(int(u * 0.6), int((v + 2) * 1.0), seed)
    lum += (grain - 0.5) * 0.22
    if noise(int(u), 7, seed + 3) > 0.93 and abs(t) < 0.5:  # a dark grain streak
        lum -= 0.16
    return ramp(wood, lum)


def tail_poly(px, py, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def edge_dist(px, py, pts):
    best = 1e9
    for i in range(len(pts)):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % len(pts)]
        dx, dy = bx - ax, by - ay
        t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy + 1e-9))
        best = min(best, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return best


# ---------------------------------------------------------------- logs
def log_icon(bark, wood_end, outline, seed):
    im = Img()
    # bottom to top so upper logs sit in front
    for (cy, xl, xr, r) in ((24, 5, 28, 4.2), (16, 4, 27, 4.2), (8.5, 6, 26, 4.2)):
        rx = 3.6

        def body(x, y, cy=cy, xl=xl, xr=xr, r=r):
            t = (y - cy) / r
            if abs(t) > 1:
                return None
            # end cap (left): ellipse of end grain with growth rings and a dark pith
            q = math.hypot((x - xl) / rx, t)
            if q <= 1.0:
                ring = 0.5 + 0.5 * math.cos(q * 4.4 * math.pi)
                c = mix(wood_end[0], wood_end[2], 0.15 + ring * 0.85)
                if q < 0.18:
                    c = wood_end[0]
                if abs(y - cy - 0.4) < 0.45 and x > xl:  # a drying crack
                    c = mix(c, wood_end[0], 0.6)
                return mix(c, hx('#ffffff'), 0.18 * clamp(-t))  # top edge catches light
            if x < xl or x > xr:
                return None
            if x > xr - 1.4 and abs(t) > 0.55:
                return None  # rounded back end
            nz = math.sqrt(max(0.0, 1 - t * t))
            lum = 0.32 + 0.42 * nz - 0.38 * t
            streak = noise(int(x / 5), int(y), seed)
            lum += (noise(int(x / 2.5), int(y), seed + 5) - 0.5) * 0.18
            if streak > 0.86:
                lum -= 0.2  # bark crack
            if noise(int(x / 3), int(y / 2), seed + 9) > 0.95:
                lum += 0.15
            return ramp(bark, lum)
        im.paint(body)
    im.outline(outline)
    return im


# ---------------------------------------------------------------- axes and pickaxes
def metal_ramp(tier):
    return [hx(s) for s in tier]


BRONZE = ('#4a2a12', '#8c4e22', '#c47a34', '#e6a85a', '#fbe0a8')
IRON = ('#1f2328', '#4a5058', '#7b838d', '#aab2bb', '#e2e8ee')
STEEL = ('#1c2634', '#3e566e', '#6f8fae', '#a7c4de', '#f0f8ff')


def axe_icon(tier, outline, seed):
    metal = metal_ramp(tier)
    im = Img()
    ox, oy, ang, length = 4.5, 28.0, -math.pi / 4, 27.0
    lh = 21.0
    poly = [(lh - 3.2, 3.0), (lh + 3.2, 3.0), (lh + 3.4, -2.0), (lh + 7.0, -9.2), (lh + 4.5, -11.0),
            (lh, -11.4), (lh - 4.5, -10.8), (lh - 6.8, -8.8), (lh - 3.2, -2.0)]

    def fn(x, y):
        u, v = seg_uv(x, y, ox, oy, ang)
        if tail_poly(u, v, poly):
            d_edge = edge_dist(u, v, poly)
            lum = 0.52 - 0.035 * (v + 4) + (noise(int(u), int(v), seed) - 0.5) * 0.10
            if v < -8.4:  # bevelled cutting edge
                lum = 0.88 if d_edge < 1.15 else 0.66
            elif d_edge < 0.9:
                lum += 0.14  # rim light
            if abs(v + 0.2) < 0.55 and abs(u - lh) < 3.4:
                lum -= 0.20  # eye / wedge seam
            if u > lh + 4.6 and v > -3:
                lum -= 0.1
            return ramp(metal, lum)
        return haft(x, y, ox, oy, ang, length, seed=seed)
    im.paint(fn)
    im.outline(outline)
    return im


def pick_icon(tier, outline, seed):
    metal = metal_ramp(tier)
    im = Img()
    ox, oy, ang, length = 4.5, 28.0, -math.pi / 4, 26.0
    lh = 23.5

    def fn(x, y):
        u, v = seg_uv(x, y, ox, oy, ang)
        a = abs(v)
        if a <= 12.0:
            uc = lh - (v / 12.0) ** 2 * 5.5
            w = 2.7 - 2.1 * (a / 12.0) ** 1.4
            du = (u - uc) / max(w, 0.6)
            if abs(du) <= 1.0:
                lum = 0.52 + 0.30 * du - 0.012 * v + (noise(int(u), int(v), seed) - 0.5) * 0.08
                if a > 8.5 and lum > 0.5:
                    lum += 0.12  # sharp tips catch light
                if a < 2.6:
                    lum = 0.30 + 0.25 * (du + 1) / 2  # socket band
                    if abs(a - 1.0) < 0.5:
                        lum -= 0.1
                return ramp(metal, lum)
        return haft(x, y, ox, oy, ang, length, seed=seed)
    im.paint(fn)
    im.outline(outline)
    return im


# ---------------------------------------------------------------- ores
def ore_icon(base, flecks, outline, seed, shape=(0.0, 1.1, 2.0)):
    im = Img()
    cx, cy = 16.0, 17.0
    pts = []
    for k in range(16):
        a = noise(k, 3, seed) * 6.28
        d = noise(k, 5, seed) * 8.0
        pts.append((cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8, 0.6 + noise(k, 8, seed) * 0.9, k % len(flecks)))

    def fn(x, y):
        dx, dy = x - cx, y - cy
        ang = math.atan2(dy, dx)
        r = 11.0 + 1.9 * math.sin(2 * ang + shape[0]) + 1.2 * math.sin(3 * ang + shape[1]) + 0.8 * math.sin(5 * ang + shape[2])
        r *= 1.0 if dy < 0 else 0.86  # flatter bottom: it sits on the ground
        d = math.hypot(dx, dy)
        if d > r:
            return None
        h = math.sqrt(max(0.0, 1 - (d / r) ** 2))
        lum = 0.38 + 0.30 * h + 0.34 * (-dx * 0.5 - dy * 0.75) / r
        lum += (noise(int(x / 2.6), int(y / 2.6), seed) - 0.5) * 0.24  # rough facets
        lum += (noise(int(x), int(y), seed + 1) - 0.5) * 0.08
        if dy > 0 and d > r - 1.6:
            lum -= 0.16  # contact shadow
        c = ramp(base, lum)
        for (fx, fy, fr, which) in pts:
            if math.hypot(x - fx, y - fy) < fr:
                fc = flecks[which]
                shade = 0.35 + 0.65 * clamp(lum + 0.15)
                return mix(tuple(int(ch * shade) for ch in fc), fc, 0.4 + 0.3 * clamp(1 - (math.hypot(x - fx, y - fy) / fr)))
        return c
    im.paint(fn)
    im.outline(outline)
    return im


# ---------------------------------------------------------------- fish
def fish_icon(length, half, back, mid, belly, outline, seed, spots=0, rot=-0.42, stripe=None, tint=0.0, speckle=None, bars=None, grill=None, cooked_eye=False, gloss=0.0, burnt=None, sear=0.72):
    im = Img()
    xs, xh, cy = 16 - length / 2, 16 + length / 2, 16.0

    def fn(x, y):
        s = (x - xs) / length
        # tail fork
        if x < xs + 0.5 and x > xs - 5.5:
            k = (xs - x) / 5.5
            if abs(y - cy) < 1.0 + k * 4.4 and abs(y - cy) > k * 1.0 - 0.3:
                lum = 0.5 + 0.2 * (noise(int(x), int(y), seed) - 0.5)
                return mix(mid, belly, lum)
        if s < 0 or s > 1:
            return None
        prof = (s ** 0.55) * ((1 - s) ** 0.38) / (0.55 ** 0.55 * 0.45 ** 0.38) * 0.0 + 0.0
        sp = clamp(s, 0.001, 0.999)
        prof = (sp ** 0.62) * ((1 - sp) ** 0.42)
        prof /= (0.596 ** 0.62) * (0.404 ** 0.42)
        hh = half * prof
        if hh < 0.55:
            return None
        v = (y - cy) / hh
        if abs(v) > 1:
            return None
        if burnt:  # shrivelled: ragged, bitten-looking edge
            if abs(v) > 1.0 - 0.55 * noise(int(x * 0.8), int(y * 0.8), seed + 2) or noise(int(x), int(y), seed + 4) > 0.97:
                return None
            lum = 0.25 + 0.3 * noise(int(x), int(y), seed)
            c = mix(burnt[0], burnt[1], lum)
            if abs(v) > 0.78 or noise(int(x / 2), int(y / 2), seed + 6) > 0.86:
                c = mix(c, burnt[2], 0.75)  # dark-brown scorched edges and patches
            if noise(int(x / 2), int(y / 3), seed + 9) > 0.80 or abs(math.sin((s * length + v * 2.1) * 1.3)) < 0.10:
                c = hx('#000000')  # cracked char
            if noise(int(x), int(y), seed + 11) > 0.93:
                c = mix(c, burnt[3], 0.7)  # ash fleck
            return c
        # dorsal fin / pectoral fin handled as colour tweaks along the edge
        if v < -0.55:
            c = mix(back, mid, (v + 1) / 0.45 * 0.5)
        else:
            c = mix(mid, belly, clamp((v + 0.55) / 1.3))
        if stripe and abs(v - stripe[1]) < stripe[2]:
            c = mix(c, stripe[0], 0.75)
        if abs(v + 0.30) < 0.2:
            c = mix(c, hx('#ffffff'), 0.28)  # lateral sheen
        if (int(x) + int(y)) % 2 == 0 and abs(v) < 0.8:
            c = mix(c, back, 0.07 + tint)  # scale dither
        if s > 0.77 and s < 0.82 and abs(v) < 0.85:
            c = mix(c, back, 0.35)  # gill line
        for k in range(spots):
            sx = 0.28 + k * 0.14
            if abs(s - sx) < 0.035 and abs(v + 0.35) < 0.22:
                c = mix(back, hx('#000000'), 0.35)
        if speckle and v < 0.25 and 0.1 < s < 0.86 and noise(int(x), int(y), seed + 7) > speckle[1]:
            c = mix(c, speckle[0], 0.85)  # dark speckles
        if bars and v < -0.05 and 0.12 < s < 0.74:
            wave = math.sin(s * 38 + v * 2.2)  # wavy bars across the back
            if wave > 0.35:
                c = mix(c, bars, 0.8 * clamp((-0.05 - v) / 0.5 + 0.35))
        if grill and 0.14 < s < 0.8 and abs(v) < 0.78:
            gw = math.sin((s * length + v * 3.0) * 0.95)  # diagonal grill-bar scorch marks
            if gw > sear:
                c = mix(c, grill, 0.85)
        if gloss and v < -0.15 and noise(int(x), int(y), seed + 13) > 0.5 and abs(v + 0.45) < 0.2:
            c = mix(c, hx('#ffffff'), gloss)  # wet specular streak along the back
        if gloss and 0.1 < s < 0.8 and v > 0.2:
            c = mix(c, hx('#f4b8b4'), 0.35)  # raw pinkish belly flesh
        if cooked_eye:
            if abs(s - 0.9) < 0.045 and abs(v + 0.1) < 0.3:
                return hx('#e6e0cc')  # a cooked eye goes opaque white
            return c
        if abs(s - 0.9) < 0.04 and abs(v + 0.1) < 0.28:
            c = hx('#101820')  # eye
        if s > 0.86 and s < 0.93 and abs(v + 0.25) < 0.14:
            c = hx('#f4f4f0')
        return c
    im.paint(fn, rot=rot)
    # tiny dorsal fin
    im.outline(outline)
    return im


def shrimp_icon(outline, seed, base=('#8c4a46', '#cf8478', '#f0b4a6', '#fbe0d4'), feeler='#c06a60'):
    im = Img()
    cx, cy, R = 14.5, 17.0, 7.0

    def fn(x, y):
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        a = math.atan2(dy, dx)  # head at the upper right (a ~ -0.6) curling round through the bottom to the tail
        t = (a + 0.6) % (2 * math.pi)  # 0 at head, grows clockwise
        if t > 4.3:
            return None
        w = 3.5 - 1.3 * (t / 4.3)
        if t > 3.7:
            w = 1.7 + (t - 3.7) * 2.4  # tail fan
        dr = r - R
        if abs(dr) > w:
            return None
        k = dr / w  # -1 inner .. +1 outer
        seg = int(t * 3.6) % 2
        base_c = [hx(s) for s in base]
        lum = 0.55 - 0.40 * k + (0.0 if seg else -0.10)
        lum += (noise(int(x), int(y), seed) - 0.5) * 0.08
        if t < 0.55 and abs(k + 0.2) < 0.42 and t > 0.25:
            return hx('#14161c')  # eye
        return ramp(base_c, lum)
    im.paint(fn)
    # antennae
    for i in range(9):
        im.set(int(22 + i * 0.5), int(10 - i * 0.9), hx(feeler))
        im.set(int(23 + i * 0.3), int(12 - i * 1.0), hx(feeler))
    im.outline(outline)
    return im


# ---------------------------------------------------------------- fishing gear
def rod_icon(outline, seed):
    im = Img()
    ox, oy, ang = 3.5, 29.0, -math.pi / 4 + 0.07
    length = 31.0

    def fn(x, y):
        u, v = seg_uv(x, y, ox, oy, ang)
        if u < 0 or u > length:
            return None
        # taper from 1.6 half-width at the grip to 0.5 at the tip, slight bend
        bend = 0.0008 * u * u
        half = 1.7 - 1.25 * (u / length)
        vv = v - bend
        if abs(vv) > half:
            return None
        t = vv / half
        lum = 0.52 + 0.40 * t + (noise(int(u * 0.7), int(vv + 2), seed) - 0.5) * 0.18
        if u < 8:  # cork-ish grip wrap
            cork = [hx(s) for s in ('#5a3a1a', '#93653a', '#c79a62')]
            return ramp(cork, 0.5 + 0.35 * t + (0.10 if int(u) % 2 else -0.10))
        if abs(u - 11.5) < 0.6:
            return hx('#2c2c34')  # ferrule / guide ring
        if abs(u - 19.5) < 0.5 or abs(u - 26) < 0.5:
            return hx('#c8c8d0')
        return ramp(WOOD, lum)
    im.paint(fn)
    # reel
    for (dx, dy, c) in ((9, 22, '#3a3f46'), (10, 22, '#9aa2ac'), (9, 23, '#6a727c'), (10, 23, '#3a3f46'), (8, 22, '#3a3f46'), (9, 21, '#3a3f46')):
        im.set(dx, dy, hx(c))
    # line from the tip, down to a hook and a red/white bobber
    tx, ty = 26, 5
    for i in range(0, 15):
        im.set(tx + int(i * 0.2) + (1 if i > 3 else 0), ty + i, hx('#dfe6ea'))
    for (dx, dy, c) in ((29, 19, '#e23b3b'), (30, 19, '#e23b3b'), (29, 20, '#e23b3b'), (30, 20, '#e23b3b'),
                        (29, 21, '#f4f4f4'), (30, 21, '#f4f4f4'), (29, 22, '#f4f4f4'), (30, 22, '#f4f4f4')):
        im.set(dx, dy, hx(c))
    im.set(30, 23, hx('#aab2bb'))
    im.set(30, 24, hx('#aab2bb'))
    im.set(29, 25, hx('#aab2bb'))
    im.outline(outline)
    return im


def net_icon(outline, seed):
    im = Img()
    ox, oy, ang = 3.5, 29.0, -math.pi / 4
    hcx, hcy, hrx, hry = 20.0, 12.5, 10.0, 8.6
    rope = [hx(s) for s in ('#6b4a24', '#a67c45', '#d9b878', '#f2dca8')]

    def fn(x, y):
        dx, dy = (x - hcx) / hrx, (y - hcy) / hry
        q = math.hypot(dx, dy)
        if q <= 1.0:
            if q > 0.80:  # rope hoop, lit from the upper left
                t = (-dx - dy) / 2
                return ramp(rope, 0.5 + 0.4 * t + (noise(int(x), int(y), seed) - 0.5) * 0.15)
            # mesh: diamond cords over a dark, slightly blue backing
            if (int(x) + int(y)) % 4 == 0 or (int(x) - int(y)) % 4 == 0:
                knot = (int(x) % 4 == 0 and int(y) % 4 == 0) or ((int(x) + 2) % 4 == 0 and (int(y) + 2) % 4 == 0)
                return ramp(rope, 0.8 if knot else 0.55 + 0.1 * (-dx - dy))
            return mix(hx('#27404f'), hx('#3d6478'), clamp(0.5 - 0.3 * (dx + dy)))
        return haft(x, y, ox, oy, ang, 13.0, half=1.4, seed=seed)
    im.paint(fn)
    im.outline(outline)
    return im


def bait_icon(outline, seed):
    im = Img()
    soil = [hx(s) for s in ('#2a1a10', '#4a2f1c', '#6e4a2e', '#8f6a46')]
    worm = [hx(s) for s in ('#7a3a3a', '#b8605e', '#e08a80', '#f6b8aa')]

    def fn(x, y):
        # soil mound
        dx, dy = (x - 16) / 12.5, (y - 24) / 6.5
        mound = math.hypot(dx, dy) <= 1.0 and y >= 19
        # three worms as sine-wiggling tubes
        for (wy, ph, x0, x1) in ((12.5, 0.0, 6, 25), (16.5, 2.0, 8, 27)):
            if x0 <= x <= x1:
                yc = wy + 1.6 * math.sin((x - x0) * 0.62 + ph)
                t = (y - yc) / 1.7
                if abs(t) <= 1:
                    seg = int(x) % 3 == 0
                    lum = 0.55 - 0.38 * t - (0.12 if seg else 0.0)
                    return ramp(worm, lum)
        if mound:
            lum = 0.45 - 0.35 * dy - 0.15 * dx + (noise(int(x), int(y), seed) - 0.5) * 0.3
            return ramp(soil, lum)
        return None
    im.paint(fn)
    im.outline(outline)
    return im


# ---------------------------------------------------------------- meat, tinderbox, ashes
def drumstick_icon(flesh, bone, outline, seed, gloss=0.0, crisp=0.0, fat=None, grill=None):
    """Chicken leg: plump meat head at the upper right tapering to a bone with a knobbed end at the lower left."""
    im = Img()
    mx, my, mrx, mry, rot = 19.5, 12.5, 10.5, 8.6, -0.55
    cr, sr = math.cos(rot), math.sin(rot)

    def fn(x, y):
        # bone shaft + knob (drawn first so the meat overlaps it)
        u, v = seg_uv(x, y, 12.5, 20.5, math.atan2(7.0, -7.5))
        out = None
        if 0 <= u <= 9.5 and abs(v) <= 1.5 - 0.0 * u:
            t = v / 1.5
            out = ramp(bone, 0.55 + 0.38 * -t + (noise(int(x), int(y), seed + 3) - 0.5) * 0.08)
        for (kx, ky) in ((6.2, 26.8), (9.6, 28.2)):
            d = math.hypot(x - kx, y - ky)
            if d <= 2.5:
                out = ramp(bone, 0.62 - 0.30 * ((x - kx) * 0.6 + (y - ky) * 0.8) / 2.5)
        dx, dy = x - mx, y - my
        lx, ly = (dx * cr + dy * sr) / mrx, (-dx * sr + dy * cr) / mry
        # the head narrows towards the bone end (lower left, local -x)
        taper = 1.0 - 0.38 * clamp(-lx)
        q = math.hypot(lx, ly / taper)
        if q <= 1.0 and lx > -1.18:
            h = math.sqrt(max(0.0, 1 - q * q))
            lum = 0.34 + 0.38 * h + 0.34 * (-dx * 0.45 - dy * 0.75) / mrx
            lum += (noise(int(x / 2), int(y / 2), seed) - 0.5) * 0.16 + (noise(int(x), int(y), seed + 1) - 0.5) * 0.08
            if crisp and noise(int(x), int(y), seed + 5) > 0.82:
                lum -= crisp  # crisped skin speckles
            c = ramp(flesh, lum)
            if grill and math.sin((dx - dy) * 0.95) > 0.62 and q < 0.9:
                c = mix(c, grill, 0.8)  # sear marks
            if gloss and h > 0.55 and (-dx - dy) > 4.0 and noise(int(x), int(y), seed + 9) > 0.35:
                c = mix(c, hx('#ffffff'), gloss * h)  # wet specular
            if fat and noise(int(x / 3), int(y / 2), seed + 12) > 0.84 and h > 0.3:
                c = mix(c, fat, 0.55)  # pale fat streaks
            return c
        return out
    im.paint(fn)
    im.outline(outline)
    return im


def steak_icon(flesh, rim, outline, seed, marble=0.0, grill=None, gloss=0.0, crisp=0.0, scale=1.0, jag=0.0, crack=None):
    """A thick slab of beef with a fat rim; marbling when raw, grill bars when cooked."""
    im = Img()
    cx, cy = 16.0, 17.5

    def fn(x, y):
        dx, dy = x - cx, y - cy
        ang = math.atan2(dy, dx)
        r = 1.0 + 0.10 * math.sin(2 * ang + seed) + 0.07 * math.sin(3 * ang + seed * 2.0)
        r = r * scale + jag * (noise(int((ang + 3.2) * 4.0), 1, seed) - 0.5)  # shrivelled, spiky outline
        q = math.hypot(dx / (12.4 * r), dy / (9.2 * r))
        if q > 1.0:
            return None
        h = math.sqrt(max(0.0, 1 - q * q))
        lum = 0.40 + 0.28 * h + 0.30 * (-dx * 0.5 - dy * 0.75) / 12.0
        lum += (noise(int(x / 2), int(y / 2), seed) - 0.5) * 0.14 + (noise(int(x), int(y), seed + 1) - 0.5) * 0.08
        c = ramp(flesh, lum)
        if q > 0.86:  # the fat/bark rim
            c = ramp(rim, 0.45 + 0.35 * (-dx - dy) / 18.0 + (noise(int(x), int(y), seed + 4) - 0.5) * 0.16)
        elif marble and noise(int(x / 2.4), int(y / 1.6), seed + 6) > 1.0 - marble:
            c = mix(c, rim[2], 0.7)
        if crisp and noise(int(x), int(y), seed + 5) > 0.80:
            c = mix(c, hx('#000000'), crisp)
        if crack and (noise(int(x / 2), int(y / 3), seed + 8) > 0.78 or abs(math.sin((dx * 0.8 - dy * 1.3) * 0.9)) < 0.08):
            c = crack  # cracked char fissures
        if grill and q < 0.86:
            gw = math.sin((x + y) * 0.9 + 0.8)
            if gw > 0.70:
                c = mix(c, grill, 0.78)
        if gloss and h > 0.5 and (-dx - dy) > 3.5 and noise(int(x), int(y), seed + 9) > 0.45:
            c = mix(c, hx('#ffffff'), gloss * h)
        return c
    im.paint(fn)
    im.outline(outline)
    return im


def tinderbox_icon(outline, seed):
    """A small wooden box with a sliding lid ajar (dry tinder inside), brass clasp, flint and a steel striker."""
    im = Img()
    box = [hx(s) for s in ('#2e1b0e', '#553319', '#7e5128', '#a8763c', '#cfa064')]
    brass = [hx(s) for s in ('#4a3510', '#8a6a1c', '#c9a23a', '#f0d070', '#fff4b0')]
    steel = [hx(s) for s in ('#1c2026', '#454c56', '#7c8692', '#b4bec9', '#eef3f8')]

    def fn(x, y):
        # front face: x 4..24, y 15..27 ; lid / top face is a parallelogram above it shifted right
        if 4 <= x <= 24 and 15 <= y <= 27:
            t = (y - 15) / 12.0
            plank = int((y - 15) / 4.0)
            lum = 0.58 - 0.20 * t + (noise(int(x / 6), plank, seed) - 0.5) * 0.14 + (noise(int(x * 0.5), int(y), seed + 1) - 0.5) * 0.12
            if abs((y - 15) % 4.0 - 3.5) < 0.6:
                lum -= 0.18  # plank seam
            if x < 5.5:
                lum += 0.12
            if 13 < x < 15.5 and 14.5 < y < 20:  # brass clasp plate and keyhole
                return mix(ramp(brass, 0.6 + 0.3 * (14.4 - x) / 2), hx('#2a1c08'), 0.9 if 16.2 < y < 18.2 and 13.9 < x < 14.8 else 0.0)
            return ramp(box, lum)
        if 4 <= x <= 24 and 15 <= y <= 27:
            return None
        # top face: from (4,15)-(24,15) back to (9,9)-(29,9)
        k = (15 - y) / 6.0
        if 0 <= k <= 1 and 4 + 5 * k <= x <= 24 + 5 * k:
            if 0.2 < k < 0.82 and 6.5 + 5 * k <= x <= 20 + 5 * k:
                # opening: dark inside with pale tinder fluff
                n = noise(int(x), int(y), seed + 2)
                if n > 0.62:
                    return mix(hx('#e8d9a8'), hx('#a98a52'), noise(int(x), int(y), seed + 8))
                return mix(hx('#2a1c10'), hx('#6b4c28'), n)
            return ramp(box, 0.72 + 0.14 * (1 - k) + (noise(int(x), int(y), seed + 3) - 0.5) * 0.1)
        # right side face
        if 24 < x <= 29 and 9 + (x - 24) * -0.0 <= y <= 27:
            kk = (x - 24) / 5.0
            if 15 - 6 * kk <= y <= 27 - 6 * kk:
                return ramp(box, 0.30 + (noise(int(x), int(y), seed + 4) - 0.5) * 0.12)
        return None
    im.paint(fn)
    # flint (grey chip) and steel striker in front of the box
    def chip(x, y):
        dx, dy = (x - 24.5) / 3.6, (y - 26.0) / 2.8
        q = math.hypot(dx, dy)
        if q > 1.0:
            return None
        return ramp(steel, 0.30 + 0.25 * (-dx - dy) + (noise(int(x), int(y), seed + 6) - 0.5) * 0.3)
    im.paint(lambda x, y: chip(x, y) if y > 22.5 and x > 20 else None)
    for i in range(10):  # striker: slim steel bar, diagonal over the front-left
        px, py = 3 + i, 28 - int(i * 0.5)
        im.set(px, py, steel[3] if i % 3 == 0 else steel[2])
        im.set(px, py + 1, steel[1])
    for (sx, sy, c) in ((26, 22, '#ffd060'), (27, 21, '#fff0a0'), (25, 20, '#ff9a30'), (28, 23, '#ffb040')):
        im.set(sx, sy, hx(c))  # struck sparks
    im.outline(outline)
    return im


def ashes_icon(outline, seed):
    """A low, flat, soft-edged heap of pale ash: darker grey core, a few charcoal bits, one ember speck.
    No outline (outline arg kept for the registry call shape): a rim would read as a rock."""
    im = Img()
    ash = [hx(s) for s in ('#5e5f64', '#8c8d90', '#b9bab9', '#dcdcd8', '#f2f2ee')]
    cx, cy = 16.0, 22.0
    rx, ry = 14.0, 6.6

    def fn(x, y):
        dx, dy = (x - cx) / rx, (y - cy) / ry
        # flatter underneath, a gentle mound on top
        q = math.hypot(dx, dy * (1.0 if dy < 0 else 1.5))
        jag = (noise(int(x), int(y), seed) - 0.5) * 0.18 + 0.07 * math.sin(dx * 6 + seed)
        if q > 1.0 + jag:
            return None
        h = math.sqrt(max(0.0, 1 - min(q, 1.0) ** 2))
        lum = 0.40 + 0.34 * h - 0.14 * dy - 0.06 * dx
        lum += (noise(int(x), int(y), seed + 1) - 0.5) * 0.14
        # darker grey core near the middle
        core = max(0.0, 1 - math.hypot((x - 15.5) / 6.5, (y - 21.5) / 3.2))
        lum -= 0.46 * core
        # soft edge: fade the rim towards a pale dusty tone, never dark
        if q > 0.80 + jag:
            return mix(ramp(ash, lum), hx('#c9c9c4'), 0.55)
        n = noise(int(x), int(y), seed + 3)
        if n < 0.05:
            return hx('#f8f8f4')
        return ramp(ash, lum)
    im.paint(fn)
    # scattered dust specks just outside the heap
    for (sx, sy) in ((4, 24), (27, 23), (7, 26), (25, 26), (10, 18), (22, 18)):
        if (sx, sy) not in im.p and noise(sx, sy, seed + 5) > 0.2:
            im.set(sx, sy, hx('#bdbdb8'))
    # a few black charcoal bits sitting in the heap
    for (lx, ly, lw, lh) in ((12, 21, 2, 1), (19, 23, 2, 1), (16, 20, 1, 1), (22, 22, 1, 1)):
        for yy in range(lh):
            for xx in range(lw):
                im.set(lx + xx, ly + yy, hx('#1b1b1f') if (xx + yy) % 2 == 0 else hx('#34343a'))
    im.set(15, 22, hx('#d8662a'))  # faint ember speck
    return im


# ---------------------------------------------------------------- the registry
def build():
    O_WOOD = hx('#1c1108')
    O_MET = hx('#14161b')
    out = {}
    out['logs'] = log_icon([hx(s) for s in ('#3f2514', '#6a3f22', '#9a6234', '#c58f55')],
                           [hx(s) for s in ('#8a5a30', '#d8b078', '#f2d9a4')], O_WOOD, 11)
    out['oak_logs'] = log_icon([hx(s) for s in ('#2a1d12', '#46301c', '#6a4a2c', '#8d6a42')],
                               [hx(s) for s in ('#6e4620', '#c08a48', '#e6bd78')], O_WOOD, 23)
    out['bronze_axe'] = axe_icon(BRONZE, O_WOOD, 3)
    out['iron_axe'] = axe_icon(IRON, O_WOOD, 5)
    out['bronze_pickaxe'] = pick_icon(BRONZE, O_WOOD, 7)
    out['iron_pickaxe'] = pick_icon(IRON, O_WOOD, 9)
    out['steel_pickaxe'] = pick_icon(STEEL, O_WOOD, 13)
    rock_o = hx('#15130f')
    out['copper_ore'] = ore_icon([hx(s) for s in ('#2e2622', '#5a4a40', '#8a7466', '#b9a392')],
                                 [hx('#d9702e'), hx('#4aa585'), hx('#f0a050')], rock_o, 31)
    out['tin_ore'] = ore_icon([hx(s) for s in ('#2a2e36', '#555c68', '#848d9b', '#b6bfcb')],
                              [hx('#dfe6ee'), hx('#f8fbff'), hx('#aab8c8')], rock_o, 37, (1.3, 0.2, 2.8))
    out['iron_ore'] = ore_icon([hx(s) for s in ('#1e1c20', '#403c40', '#6a6468', '#948b8c')],
                               [hx('#a2502e'), hx('#7a3a22'), hx('#c0683a')], rock_o, 41, (2.4, 1.9, 0.7))
    out['coal'] = ore_icon([hx(s) for s in ('#121216', '#26262d', '#41424c', '#666a78')],
                           [hx('#0a0a0d'), hx('#7d8798'), hx('#1c1c22')], rock_o, 47, (0.9, 2.6, 1.4))
    fo = hx('#0d1620')
    out['raw_shrimp'] = shrimp_icon(hx('#3a1a18'), 17)
    out['raw_anchovies'] = fish_icon(25, 3.2, hx('#3d5a3a'), hx('#a9bcb4'), hx('#eef2ee'), fo, 5,
                                     stripe=(hx('#cfe0ea'), 0.0, 0.22), rot=-0.45, gloss=0.55)
    out['raw_sardine'] = fish_icon(22, 4.4, hx('#2a5470'), hx('#9cb4c4'), hx('#f0f4f6'), fo, 8, spots=3, rot=-0.4, gloss=0.55)
    out['raw_herring'] = fish_icon(24, 5.8, hx('#2f4a6e'), hx('#aab8c8'), hx('#f6f2e6'), fo, 12, rot=-0.35, tint=0.03, gloss=0.55)
    out['raw_trout'] = fish_icon(25, 5.6, hx('#46561f'), hx('#7f8448'), hx('#e2d6b0'), fo, 21, rot=-0.38,
                                 stripe=(hx('#e5707e'), 0.0, 0.2), speckle=(hx('#1f220c'), 0.72), gloss=0.5)
    out['raw_mackerel'] = fish_icon(26, 4.8, hx('#1f7a78'), hx('#8fb8c0'), hx('#f4f7fa'), fo, 26, rot=-0.4,
                                    bars=hx('#08202e'), tint=0.02, gloss=0.5)
    # cooked: same silhouette as the raw fish, browned and glossy, grill scorch bars, opaque white eye
    GR = hx('#2e1606')
    out['shrimps'] = shrimp_icon(hx('#3a1408'), 17, base=('#8a2c14', '#d8582a', '#f2924e', '#ffd09c'), feeler='#e07a3c')
    out['anchovies'] = fish_icon(25, 3.2, hx('#9a7a30'), hx('#e0b25c'), hx('#f6d890'), hx('#2a180a'), 5,
                                 stripe=(hx('#f0dcb0'), 0.0, 0.2), rot=-0.45, grill=GR, cooked_eye=True, sear=0.55)
    out['sardine'] = fish_icon(22, 4.4, hx('#7a5a28'), hx('#c8964a'), hx('#ecc886'), hx('#2a180a'), 8, spots=3, rot=-0.4,
                               grill=GR, cooked_eye=True, sear=0.55)
    out['herring'] = fish_icon(24, 5.8, hx('#80501c'), hx('#d89c4c'), hx('#f6dc92'), hx('#2a180a'), 12, rot=-0.35,
                               tint=0.03, grill=GR, cooked_eye=True, sear=0.55)
    out['trout'] = fish_icon(25, 5.6, hx('#7a4e1c'), hx('#cc8c44'), hx('#f2cc84'), hx('#2a180a'), 21, rot=-0.38,
                             stripe=(hx('#e0a070'), 0.0, 0.2), speckle=(hx('#4a2808'), 0.78), grill=GR, cooked_eye=True, sear=0.55)
    out['mackerel'] = fish_icon(26, 4.8, hx('#7c4a18'), hx('#c8843c'), hx('#f0c47c'), hx('#2a180a'), 26, rot=-0.4,
                                bars=hx('#3e2208'), tint=0.02, grill=GR, cooked_eye=True, sear=0.55)
    out['burnt_fish'] = fish_icon(19, 4.2, hx('#121010'), hx('#241f1b'), hx('#3a342d'), hx('#050505'), 33, rot=-0.38,
                                  burnt=(hx('#0a0909'), hx('#26211d'), hx('#4a2e18'), hx('#8a8680')))
    BO = [hx(s) for s in ('#6a5a48', '#a89a84', '#dcd0bc', '#f6f0e4')]
    FO = hx('#2a0c0c')
    out['raw_chicken'] = drumstick_icon([hx(s) for s in ('#7a2c2c', '#c4605a', '#eb968a', '#f8c8be')], BO, FO, 51,
                                        gloss=0.45, fat=hx('#f6dcd0'))
    out['cooked_chicken'] = drumstick_icon([hx(s) for s in ('#4a2208', '#8c4c18', '#c8802c', '#eeb85c')], BO, hx('#2a1204'), 53,
                                           gloss=0.0, crisp=0.30, grill=hx('#3a1a06'))
    out['raw_beef'] = steak_icon([hx(s) for s in ('#5a1414', '#9c2a2a', '#c8484a', '#e87c78')],
                                 [hx(s) for s in ('#8a6a5a', '#c8a898', '#ecd8cc', '#fbf0e8')], FO, 4, marble=0.16, gloss=0.4)
    out['cooked_beef'] = steak_icon([hx(s) for s in ('#2a1206', '#58301a', '#8c5a30', '#b88650')],
                                    [hx(s) for s in ('#3a2210', '#6a4220', '#9a6a38', '#c89a5c')], hx('#1c0c04'), 6,
                                    grill=hx('#1c0e06'), gloss=0.0, crisp=0.25)
    out['burnt_meat'] = steak_icon([hx(s) for s in ('#08080a', '#16161a', '#2a2a30', '#46464e')],
                                   [hx(s) for s in ('#0c0806', '#2a1a10', '#4a2e18', '#6a4426')], hx('#030303'), 9,
                                   crisp=0.5, grill=hx('#000000'), scale=0.74, jag=0.34, crack=hx('#000000'))
    out['tinderbox'] = tinderbox_icon(hx('#1a0f06'), 61)
    out['ashes'] = ashes_icon(hx('#16161a'), 71)
    out['small_fishing_net'] = net_icon(O_WOOD, 21)
    out['fishing_rod'] = rod_icon(O_WOOD, 19)
    out['fishing_bait'] = bait_icon(hx('#1a0f0a'), 29)
    return out


if __name__ == '__main__':
    dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'items')
    os.makedirs(dest, exist_ok=True)
    for name, im in build().items():
        with open(os.path.join(dest, name + '.svg'), 'w') as f:
            f.write(im.svg())
    print('wrote', len(build()), 'icons to', dest)
