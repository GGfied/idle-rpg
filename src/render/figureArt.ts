/**
 * Pure pixel-art painter for people (player + NPCs). No Phaser: it paints a small colour grid from a
 * `FigureLook` (data) and turns it into merged rectangles. `views.ts` draws those rectangles into the
 * body Graphics once per look/view and keeps them cached, so nothing is painted per frame.
 *
 * Grid: 2 cells per art px (a cell is 0.5 art px), 36 x 64 cells, feet on the bottom row, centre column 18.
 * Light comes from the top-left: left edges are lit, right edges and undersides are shaded.
 * The figure is drawn in a 3/4 view facing right (the view mirrors it for left); `view: 'back'` swaps the
 * head and torso details for the back.
 */

export const FIG_W = 36;
export const FIG_H = 64;
/** Art px per grid cell. */
export const CELL = 0.5;
/** Art px between the centre column's left edge and x = 0, and between the top row and y = 0 (feet). */
export const FIG_ORIGIN = { x: (FIG_W * CELL) / 2, y: FIG_H * CELL };

export type HairStyle = 'short' | 'long' | 'bald';
export type Outfit = 'tunic' | 'coat';
export type FigureView = 'front' | 'back';

/** Everything that varies between people. Colours are 0xRRGGBB. New looks are new data, not new code. */
export interface FigureLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  outfit: Outfit;
  /** Shirt / coat colour (also the sleeves). */
  top: number;
  /** Collar, cuffs, hem and lapels. Defaults to a lighter shade of `top`. */
  trim?: number;
  pants: number;
  boots: number;
  belt?: number;
  /** Gold-style buttons and buckle (coat buttons, belt buckle). */
  metal?: number;
  /** Shirt or cravat showing at the neck of a coat. */
  shirt?: number;
  /** True when the animation rig draws the lower arms: the body then stops its arms at the elbow. */
  rigArms?: boolean;
  /** True when the animation rig also draws the upper arms (see `figureUpperArmRects`): the body then has no arms. */
  rigUpperArms?: boolean;
  /** True when the animation rig draws the legs (see `figureLegRects`): the body then stops at the hem. */
  rigLegs?: boolean;
}

export interface FigureRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

const NONE = -1;
type Ramp = readonly [deep: number, shade: number, mid: number, hi: number];

function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

const rampCache = new Map<string, Ramp>();
/** Four tones of one colour: deep, shade, mid (the colour itself), highlight. `warm` shifts skin shadows red. */
function ramp(base: number, warm = false): Ramp {
  const key = `${base}:${warm}`;
  let r = rampCache.get(key);
  if (!r) {
    const dark = warm ? 0x6a2c30 : 0x0e1226;
    r = [mix(base, dark, 0.55), mix(base, dark, 0.28), base, mix(base, 0xfff4d8, 0.22)];
    rampCache.set(key, r);
  }
  return r;
}

/** Pick a tone from a light value: > 0.55 highlight, > -0.05 mid, > -0.55 shade, else deep. */
function tone(r: Ramp, lum: number): number {
  return lum > 0.55 ? r[3] : lum > -0.05 ? r[2] : lum > -0.55 ? r[1] : r[0];
}

class Grid {
  readonly c: Int32Array;
  constructor(
    readonly w = FIG_W,
    readonly h = FIG_H,
  ) {
    this.c = new Int32Array(w * h).fill(NONE);
  }
  set(x: number, y: number, col: number): void {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.c[y * this.w + x] = col;
  }
  get(x: number, y: number): number {
    return x >= 0 && x < this.w && y >= 0 && y < this.h ? this.c[y * this.w + x]! : NONE;
  }
}

/** A cylinder-shaded run of cells: lit on the left, shaded on the right. `bias` darkens (shadow-side limbs). */
function row(g: Grid, y: number, l: number, r: number, rp: Ramp, bias = 0): void {
  const span = r - l + 1;
  for (let x = l; x <= r; x++) {
    const u = (x - l) / span;
    g.set(x, y, x === r && span > 3 ? rp[0] : tone(rp, 0.9 - 1.5 * u + bias));
  }
}

function block(g: Grid, y0: number, y1: number, l: number, r: number, rp: Ramp, bias = 0): void {
  for (let y = y0; y <= y1; y++) row(g, y, l, r, rp, bias - ((y - y0) / (y1 - y0 + 1)) * 0.15);
}

/** Sphere-shaded ellipse; `paint` may override a cell's colour (hair, face parts). */
function ellipse(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pick: (x: number, y: number, lum: number) => number,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx;
      const v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const col = pick(x, y, 0.2 - (0.6 * u + 0.5 * v));
      if (col !== NONE) g.set(x, y, col);
    }
  }
}

/** Row range of the torso at gy: [left, right] inclusive (shoulder slope, waist, skirt flare). */
function torsoSpan(y: number, outfit: Outfit): [number, number] {
  if (y <= 17) return [12, 24];
  if (y <= 30) return [10, 26];
  if (y <= 36) return [10 + Math.round((y - 30) / 6), 26 - Math.round((y - 30) / 6)];
  if (y <= 39) return [11, 25];
  if (outfit === 'tunic') return y <= 43 ? [10, 26] : [9, 27];
  return [10 - Math.floor((y - 40) / 4), 26 + Math.floor((y - 40) / 4)];
}

function paintHead(g: Grid, look: FigureLook, view: FigureView): void {
  const skin = ramp(look.skin, true);
  const hair = ramp(look.hair);
  const back = view === 'back';
  const hairPick = (x: number, y: number, lum: number): number => {
    let l = lum;
    if ((x * 3 + y * 2) % 7 === 0)
      l += 0.45; // strands
    else if ((x + y * 3) % 11 === 0) l -= 0.4;
    return tone(hair, l);
  };
  // Long hair falls behind the shoulders: painted first so the torso overlaps it.
  if (look.hairStyle === 'long') {
    for (let y = 7; y <= 27; y++) {
      const l = y < 20 ? 11 : 12;
      const r = y < 20 ? 15 : 14;
      for (let x = l; x <= (back ? 25 - (l - 11) : r); x++)
        g.set(x, y, hairPick(x, y, 0.3 - (x - l) * 0.25));
    }
  }
  // Neck (shadowed under the chin).
  for (let y = 14; y <= 18; y++) row(g, y, 15, 20, skin, y < 16 ? -0.6 : -0.15);
  // Head.
  const hairLine = (x: number): number => (x >= 21 ? 5 : x >= 15 ? 5 : 6);
  ellipse(g, 18, 8, 5.6, 6.6, (x, y, lum) => {
    if (back || (look.hairStyle !== 'bald' && (y <= hairLine(x) || (x <= 13 && y <= 11))))
      return hairPick(x, y, lum);
    return tone(skin, lum + (y > 12 ? -0.1 : 0));
  });
  // Hair volume: a fuller crown that overhangs the temples.
  if (look.hairStyle !== 'bald') {
    ellipse(g, 17.5, 6, 6.4, 5.2, (x, y, lum) =>
      y <= 4 || back || (x <= 12 && y <= 9) ? hairPick(x, y, lum) : NONE,
    );
  }
  if (back) return;
  // Face (3/4 view): ear, brows, eyes, nose, mouth.
  g.set(11, 9, skin[1]);
  g.set(11, 10, skin[0]);
  const eye = 0x2a1c18;
  const brow = ramp(look.hair)[1];
  for (const [ex, ew] of [
    [15, 2],
    [20, 2],
  ] as const) {
    for (let i = 0; i < ew; i++) {
      g.set(ex + i, 7, brow);
      g.set(ex + i, 8, eye);
      g.set(ex + i, 9, i === 0 ? eye : skin[1]);
    }
  }
  g.set(22, 10, skin[1]);
  g.set(22, 11, skin[0]);
  for (let x = 18; x <= 20; x++) g.set(x, 13, mix(look.skin, 0xa8403c, 0.55));
  g.set(17, 13, skin[1]);
}

function paintLegs(g: Grid, look: FigureLook): void {
  const pants = ramp(look.pants);
  const boots = ramp(look.boots);
  block(g, 40, 57, 11, 17, pants);
  block(g, 40, 57, 19, 25, pants, -0.1);
  for (const [x, y] of [
    [13, 49],
    [14, 50],
    [22, 50],
    [21, 49],
    [12, 53],
    [23, 54],
  ] as const) {
    g.set(x, y, pants[1]); // knee and shin folds
  }
  for (const [l, r] of [
    [10, 19],
    [19, 28],
  ] as const) {
    for (let y = 57; y <= 63; y++) {
      const toe = y >= 61 ? 1 : 0;
      row(g, y, l + (y === 57 ? 0 : 1), r - 1 + toe, boots, y === 63 ? -0.9 : 0);
    }
    for (let x = l; x < r; x++) g.set(x, 57, boots[3]); // cuff
  }
}

function paintTorso(g: Grid, look: FigureLook, view: FigureView): void {
  const top = ramp(look.top);
  const trim = ramp(look.trim ?? mix(look.top, 0xffffff, 0.3));
  const skin = ramp(look.skin, true);
  const hem = look.outfit === 'tunic' ? 44 : 52;
  for (let y = 17; y <= hem; y++) {
    const [l, r] = torsoSpan(y, look.outfit);
    row(g, y, l, r, top, -((y - 17) / 70));
  }
  // Cloth folds: gathers above the belt, and fold lines down the skirt.
  const fold: [number, number][] =
    look.outfit === 'tunic'
      ? [
          [14, 33],
          [14, 34],
          [15, 35],
          [21, 32],
          [21, 33],
          [22, 34],
        ]
      : [];
  for (const [x, y] of fold) g.set(x, y, top[1]);
  for (let y = 40; y <= hem - 1; y++) {
    g.set(14 + ((y - 40) >> 3), y, top[1]);
    g.set(23 - ((y - 40) >> 3), y, top[0]);
  }
  if (view === 'back') {
    for (let y = 21; y <= 36; y++) g.set(18, y, top[1]); // spine seam
    for (let x = 12; x <= 24; x++) g.set(x, 17, trim[1]); // back of collar
    if (look.outfit === 'coat') for (let y = 40; y <= hem; y++) g.set(18, y, top[0]); // back vent
  } else {
    // Neckline.
    for (const x of [12, 13, 14, 15, 21, 22, 23, 24]) g.set(x, 17, trim[2]);
    for (const x of [11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25]) g.set(x, 18, trim[3]);
    if (look.outfit === 'coat') paintCoatFront(g, look, top, trim);
    else {
      for (let x = 16; x <= 20; x++) g.set(x, 17, skin[1]);
      for (let x = 17; x <= 19; x++) g.set(x, 18, skin[1]);
      g.set(18, 19, skin[0]);
      for (let y = 20; y <= 30; y++) g.set(18, y, top[1]); // centre seam
    }
  }
  paintSkirtHem(g, look, trim, hem);
  if (look.belt !== undefined) paintBelt(g, look, view);
}

function paintCoatFront(g: Grid, look: FigureLook, top: Ramp, trim: Ramp): void {
  const shirt = ramp(look.shirt ?? 0xeeeae0);
  const gold = look.metal ?? 0xe0b84a;
  for (let y = 19; y <= 33; y++) {
    const half = Math.max(0, 4 - Math.floor((y - 19) / 3));
    for (let x = 18 - half; x <= 18 + half; x++) g.set(x, y, tone(shirt, 0.8 - (x - 14) * 0.3));
    g.set(18 - half - 1, y, mix(look.top, gold, 0.85)); // lapel edge
    g.set(18 + half + 1, y, mix(look.top, gold, 0.55));
  }
  for (let y = 31; y <= 49; y += 3) g.set(19, y, gold); // buttons
  for (let y = 44; y <= 51; y++) g.set(18, y, top[0]); // front slit
  g.set(14, 41, trim[3]);
  g.set(15, 41, trim[3]);
}

function paintSkirtHem(g: Grid, look: FigureLook, trim: Ramp, hem: number): void {
  const gold = look.outfit === 'coat' ? (look.metal ?? 0xe0b84a) : undefined;
  for (let y = hem - 1; y <= hem; y++) {
    const [l, r] = torsoSpan(y, look.outfit);
    for (let x = l; x <= r; x++)
      g.set(
        x,
        y,
        gold !== undefined
          ? tone(ramp(gold), 0.8 - (x - l) * 0.08)
          : look.trim
            ? trim[2]
            : ramp(look.top)[1],
      );
  }
}

function paintBelt(g: Grid, look: FigureLook, view: FigureView): void {
  const belt = ramp(look.belt ?? 0x4a3120);
  for (let y = 37; y <= 39; y++) row(g, y, 11, 25, belt, y === 39 ? -0.4 : 0.1);
  if (view === 'front' && look.metal !== undefined) {
    for (let y = 37; y <= 39; y++)
      for (let x = 19; x <= 21; x++)
        g.set(x, y, y === 38 && x === 20 ? belt[0] : ramp(look.metal)[y === 37 ? 3 : 2]);
  }
}

/** First and last sleeve rows of the upper arm, in cells (the elbow is the top of the row after). */
const SHOULDER_ROW = 19;
const ELBOW_LAST_ROW = 32;

function paintArm(g: Grid, look: FigureLook, mirror: boolean): void {
  const sleeve = ramp(look.top);
  const trim = ramp(look.trim ?? mix(look.top, 0xffffff, 0.3));
  const skin = ramp(look.skin, true);
  const bias = mirror ? -0.4 : 0;
  const put = (y: number, l: number, r: number, rp: Ramp, b = bias): void => {
    const a = mirror ? 35 - r : l;
    const c = mirror ? 35 - l : r;
    // Mirrored arms keep "left lit" shading by flipping the run after painting.
    row(g, y, a, c, rp, b);
  };
  const elbow = look.rigArms ? ELBOW_LAST_ROW : 35;
  for (let y = SHOULDER_ROW; y <= elbow; y++) {
    const inset = y === 19 ? 2 : y === 20 ? 1 : 0;
    put(y, 2 + inset, 9, sleeve);
  }
  if (!look.rigArms) {
    for (let y = elbow + 1; y <= 43; y++) put(y, 3, 8, sleeve);
    g.set(mirror ? 32 : 3, 36, sleeve[1]);
    for (let y = 44; y <= 45; y++) put(y, 3, 8, trim, bias);
    for (let y = 46; y <= 51; y++) put(y, 4, 8, skin, bias + (y > 49 ? -0.2 : 0));
  }
}

/** Paint a figure into a grid of colours (NONE = -1 means transparent). */
export function paintFigure(look: FigureLook, view: FigureView): Int32Array {
  const g = new Grid();
  paintHead(g, look, view);
  if (!look.rigLegs) paintLegs(g, look);
  paintTorso(g, look, view);
  if (!look.rigUpperArms) {
    paintArm(g, look, false);
    paintArm(g, look, true);
  }
  // Neck and head go over the collar again so the chin overlaps it.
  outline(g);
  return g.c;
}

/** One-cell dark outline around the silhouette, tinted by the cell it hugs. */
function outline(g: Grid): void {
  const out: [number, number, number][] = [];
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== NONE) continue;
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ] as const) {
        const n = g.get(x + dx, y + dy);
        if (n !== NONE) {
          out.push([x, y, mix(n, 0x0c0c16, 0.62)]);
          break;
        }
      }
    }
  }
  for (const [x, y, c] of out) g.set(x, y, c);
}

/** Merge same-colour neighbours into rectangles; `ox`/`oy` = art px of the grid's top-left corner. */
function gridRects(g: Grid, ox: number, oy: number): FigureRect[] {
  const open: FigureRect[] = [];
  const done: FigureRect[] = [];
  for (let y = 0; y < g.h; y++) {
    const runs: { x: number; w: number; c: number }[] = [];
    for (let x = 0; x < g.w; x++) {
      const c = g.c[y * g.w + x]!;
      if (c === NONE) continue;
      const last = runs[runs.length - 1];
      if (last && last.c === c && last.x + last.w === x) last.w++;
      else runs.push({ x, w: 1, c });
    }
    const next: FigureRect[] = [];
    for (const r of runs) {
      const rx = r.x * CELL + ox;
      const rw = r.w * CELL;
      const ry = y * CELL + oy;
      const idx = open.findIndex(
        (o) => o.color === r.c && o.x === rx && o.w === rw && o.y + o.h === ry,
      );
      if (idx >= 0) {
        const o = open.splice(idx, 1)[0]!;
        o.h += CELL;
        next.push(o);
      } else next.push({ x: rx, y: ry, w: rw, h: CELL, color: r.c });
    }
    done.push(...open);
    open.length = 0;
    open.push(...next);
  }
  done.push(...open);
  return done.sort((a, b) => a.color - b.color);
}

/** The whole figure as rectangles in art px relative to the feet (x centred, y negative up). */
export function figureRects(look: FigureLook, view: FigureView): FigureRect[] {
  const g = new Grid();
  g.c.set(paintFigure(look, view));
  return gridRects(g, -FIG_ORIGIN.x, -FIG_ORIGIN.y);
}

/** Lower arm size in cells: 4 art px wide (the rig sleeve), sleeve 6 + cuff 1.5 + hand 3 art px. */
const ARM_W = 8;
const ARM_H = 22;

/**
 * Lower arm for the animation rig, in art px with the ELBOW PIVOT at (0, 0): x spans -2..2, y runs down
 * 0..11 (sleeve, trim cuff, hand; outlined, so it reaches about 0.5 beyond). `mirror` = the far arm, drawn
 * in shadow. Same tones and outline as the body, so it joins the upper arm painted by the figure (rigArms).
 */
export function figureLowerArmRects(look: FigureLook, mirror: boolean): FigureRect[] {
  const g = new Grid(ARM_W, ARM_H);
  const sleeve = ramp(look.top);
  const trim = ramp(look.trim ?? mix(look.top, 0xffffff, 0.3));
  const skin = ramp(look.skin, true);
  const bias = mirror ? -0.4 : 0;
  for (let y = 0; y <= 11; y++) row(g, y, 0, 7, sleeve, bias);
  for (let y = 12; y <= 14; y++) row(g, y, 0, 7, trim, bias);
  g.set(mirror ? 6 : 2, 6, sleeve[1]); // elbow crease
  for (let y = 15; y <= 20; y++) row(g, y, 1, 6, skin, bias + (y > 18 ? -0.2 : 0));
  outline(g);
  return gridRects(g, -ARM_W * CELL * 0.5, 0);
}

/** Centre column (cells) of each upper arm: left arm spans cells 2..9, the mirrored one 26..33. */
const ARM_CX = 6;

/**
 * Where the rig puts the arms, art px relative to the feet (x centred, y negative up): the left arm's
 * shoulder at x = -shoulderX, the mirrored one at +shoulderX, both at y = shoulderY. `elbowY` is the
 * elbow measured DOWN from the shoulder: the lower arm container sits at (0, elbowY) inside the upper arm's.
 */
export function figureArmPivots(_look: FigureLook): {
  shoulderX: number;
  shoulderY: number;
  elbowY: number;
} {
  return {
    shoulderX: (FIG_W / 2 - ARM_CX) * CELL,
    shoulderY: SHOULDER_ROW * CELL - FIG_ORIGIN.y,
    elbowY: (ELBOW_LAST_ROW + 1 - SHOULDER_ROW) * CELL,
  };
}

/**
 * Upper arm (sleeve, shoulder to elbow) in art px with the SHOULDER PIVOT at (0, 0): x spans -2..2, y runs
 * down 0..`elbowY` (outlined, so it reaches about 0.5 beyond). `mirror` = the far arm, drawn in shadow.
 * Place the container at (-shoulderX, shoulderY) for the near arm, (+shoulderX, shoulderY) for the far one,
 * and parent `figureLowerArmRects` at (0, elbowY). Same cells the body paints when `rigUpperArms` is off.
 */
export function figureUpperArmRects(look: FigureLook, mirror: boolean): FigureRect[] {
  const g = new Grid();
  paintArm(g, { ...look, rigArms: true }, mirror);
  outline(g);
  const cx = mirror ? FIG_W - ARM_CX : ARM_CX;
  return gridRects(g, -cx * CELL, -SHOULDER_ROW * CELL);
}

const BOOT_W = 12;
const BOOT_H = 8;

/**
 * Boot for the walk-cycle feet, in art px with the origin at the middle of the boot's SOLE (x centred,
 * y 0 = ground, drawn up to -4). Same boot as the body (cuff, tone ramp, pointed toe on the right).
 * `mirror` = the far foot, in shadow. The animator moves this; no rect sticks out beyond x -3..3.
 */
export function figureBootRects(look: FigureLook, mirror: boolean): FigureRect[] {
  const g = new Grid(BOOT_W, BOOT_H);
  const boots = ramp(look.boots);
  const bias = mirror ? -0.35 : 0;
  for (let y = 0; y < BOOT_H - 1; y++) {
    const toe = y >= 4 ? 1 : 0;
    row(g, y, y === 0 ? 1 : 2, 8 + toe + 1, boots, y === BOOT_H - 2 ? -0.9 : bias);
  }
  for (let x = 1; x <= 9; x++) g.set(x, 0, boots[3]); // cuff
  outline(g);
  return gridRects(g, -BOOT_W * CELL * 0.5, -(BOOT_H - 1) * CELL);
}

/** Hip pivot of each leg: x = ±HIP_X art px from the figure centre, y = `figureLegPivots(look).hipY`. */
export const HIP_X = 2;
const LEG_W = 12;
/** The leg's centre column inside its grid. */
const LEG_CX = 6;

/** Bottom row of the hem: legs start there (tunic 44, coat 52 in cells). */
const hemCell = (look: FigureLook): number => (look.outfit === 'tunic' ? 44 : 52);

/**
 * Where the rig puts leg pivots, art px relative to the feet (x centred, y negative up): left hip at
 * x = -hipX, right hip at +hipX, both at y = hipY (the hem line, so the leg emerges from under the
 * tunic/coat). `kneeY` is the knee, in the same space (y = hipY + thighLength). `legLength` = hip to ground.
 */
export function figureLegPivots(look: FigureLook): {
  hipX: number;
  hipY: number;
  kneeY: number;
  legLength: number;
} {
  const h = FIG_H - hemCell(look);
  return {
    hipX: HIP_X,
    hipY: hemCell(look) * CELL - FIG_ORIGIN.y,
    kneeY: (hemCell(look) + (h >> 1)) * CELL - FIG_ORIGIN.y,
    legLength: h * CELL,
  };
}

function legGrid(look: FigureLook, mirror: boolean): { g: Grid; knee: number } {
  const h = FIG_H - hemCell(look);
  const g = new Grid(LEG_W, h);
  const pants = ramp(look.pants);
  const boots = ramp(look.boots);
  const bias = mirror ? -0.35 : 0;
  const boot0 = h - 6;
  for (let y = 0; y < boot0; y++) {
    row(g, y, 3, 8, pants, bias - (y / h) * 0.15);
    if (y === h >> 1 || y === (h >> 1) + 1) g.set(6, y, pants[1]); // knee fold
  }
  for (let y = boot0; y < h; y++) {
    const toe = y >= h - 3 ? 1 : 0;
    row(g, y, y === boot0 ? 2 : 3, 9 + toe, boots, y === h - 1 ? -0.9 : bias);
  }
  for (let x = 2; x <= 9; x++) g.set(x, boot0, boots[3]); // cuff
  outline(g);
  return { g, knee: h >> 1 };
}

function sliceRows(g: Grid, y0: number, y1: number): Grid {
  const out = new Grid(g.w, y1 - y0);
  out.c.set(g.c.subarray(y0 * g.w, y1 * g.w));
  return out;
}

/**
 * A whole leg (pants, knee, boot with toe on the right) in art px with the HIP PIVOT at (0,0), y down to
 * the ground (`legLength` below). x spans -3..3. `mirror` = the far leg, in shadow. Place the container at
 * (±hipX, hipY) from `figureLegPivots`.
 */
export function figureLegRects(look: FigureLook, mirror: boolean): FigureRect[] {
  return gridRects(legGrid(look, mirror).g, -LEG_CX * CELL, 0);
}

/** Thigh only, hip pivot at (0,0), down to the knee (`kneeY - hipY`). */
export function figureUpperLegRects(look: FigureLook, mirror: boolean): FigureRect[] {
  const { g, knee } = legGrid(look, mirror);
  return gridRects(sliceRows(g, 0, knee), -LEG_CX * CELL, 0);
}

/** Shin and boot only, KNEE pivot at (0,0), down to the ground. Parent it at the knee end of the thigh. */
export function figureLowerLegRects(look: FigureLook, mirror: boolean): FigureRect[] {
  const { g, knee } = legGrid(look, mirror);
  return gridRects(sliceRows(g, knee, g.h), -LEG_CX * CELL, 0);
}
