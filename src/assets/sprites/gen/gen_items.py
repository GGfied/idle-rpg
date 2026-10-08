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
def fish_icon(length, half, back, mid, belly, outline, seed, spots=0, rot=-0.42, stripe=None, tint=0.0, speckle=None, bars=None):
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
        if abs(s - 0.9) < 0.04 and abs(v + 0.1) < 0.28:
            c = hx('#101820')  # eye
        if s > 0.86 and s < 0.93 and abs(v + 0.25) < 0.14:
            c = hx('#f4f4f0')
        return c
    im.paint(fn, rot=rot)
    # tiny dorsal fin
    im.outline(outline)
    return im


def shrimp_icon(outline, seed):
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
        base = [hx(s) for s in ('#8c4a46', '#cf8478', '#f0b4a6', '#fbe0d4')]
        lum = 0.55 - 0.40 * k + (0.0 if seg else -0.10)
        lum += (noise(int(x), int(y), seed) - 0.5) * 0.08
        if t < 0.55 and abs(k + 0.2) < 0.42 and t > 0.25:
            return hx('#14161c')  # eye
        return ramp(base, lum)
    im.paint(fn)
    # antennae
    for i in range(9):
        im.set(int(22 + i * 0.5), int(10 - i * 0.9), hx('#c06a60'))
        im.set(int(23 + i * 0.3), int(12 - i * 1.0), hx('#c06a60'))
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
                                     stripe=(hx('#cfe0ea'), 0.0, 0.22), rot=-0.45)
    out['raw_sardine'] = fish_icon(22, 4.4, hx('#2a5470'), hx('#9cb4c4'), hx('#f0f4f6'), fo, 8, spots=3, rot=-0.4)
    out['raw_herring'] = fish_icon(24, 5.8, hx('#2f4a6e'), hx('#aab8c8'), hx('#f6f2e6'), fo, 12, rot=-0.35, tint=0.03)
    out['raw_trout'] = fish_icon(25, 5.6, hx('#46561f'), hx('#7f8448'), hx('#e2d6b0'), fo, 21, rot=-0.38,
                                 stripe=(hx('#e5707e'), 0.0, 0.2), speckle=(hx('#1f220c'), 0.72))
    out['raw_mackerel'] = fish_icon(26, 4.8, hx('#1f7a78'), hx('#8fb8c0'), hx('#f4f7fa'), fo, 26, rot=-0.4,
                                    bars=hx('#08202e'), tint=0.02)
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
