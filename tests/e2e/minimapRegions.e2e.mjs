// Minimap region part labels + boundary lines e2e (task #58).
// 1 Wilds label appears when walking south from spawn  2 every region label drawn, inside circle, disjoint
// 3 font ~10 CSS px at dpr 1 and 3  4 region boundary lines really painted (pixel brightness along known edges).
// Run: node tests/e2e/minimapRegions.e2e.mjs   (port 9025 +1 per combo; E2E_PORT overrides)
// Fast base: desktop (dpr 1) + phone (dpr 3) as parallel children, ?tickMs=60, frame-driven settle (no sleeps), budget 60 s.
// The minimap is a 2D canvas drawn by the HUD, not by Phaser: one renderer (webgl) is enough.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9025;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SPY = `(() => {
  const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { frame: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') window.__mm.frame = []; return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') {
    window.__mm.frame.push({ t, x, y, a: this.globalAlpha, font: this.font, align: this.textAlign, w: this.measureText(t).width }); }
    return of.call(this, t, x, y); };
})();`;

const SNAP = `(async () => {
  const W = await import('/src/features/world/index.ts');
  const cv = document.querySelector('canvas.minimap'), css = cv.clientWidth, dpr = cv.width / css;
  const r = cv.width / 2, s = 4 * (css / 160) * dpr;
  const pos = window.__idleRpg.store.getState().game.movement.position;
  const frame = window.__mm.frame.slice();
  const labels = W.WORLD_DEF.labels.filter((l) => l.kind === 'region').map((l, i) => ({ i, text: l.text, x: l.x, y: l.y, px: r + (l.x - pos.x) * s, py: r + (l.y - pos.y) * s }));
  const rc = cv.getBoundingClientRect();
  return { frame, labels, r, s, dpr, css, pos, rect: { x: rc.left, y: rc.top, w: rc.width, h: rc.height } };
})()`;

const boxOf = (f) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(f.font)[1]);
  const left = f.align === 'center' ? f.x - f.w / 2 : f.x;
  return {
    t: f.t,
    left,
    right: left + f.w,
    top: f.y - px / 2,
    bottom: f.y + px / 2,
    px,
    a: f.a ?? 1,
  };
};
const raf = (g, n = 2) =>
  g.cdp.eval(
    `new Promise((r) => { const f = (k) => (k <= 0 ? r(1) : requestAnimationFrame(() => f(k - 1))); f(${n}); })`,
  );
const snap = (g) => g.cdp.eval(SNAP);
// Wait for the minimap trail glide to end (drawn frame unchanged for 3 samples, 5 frames apart) instead of sleeps.
const settleFrame = async (g) => {
  let last = '',
    same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    await raf(g, 5);
    const cur = await g.cdp.eval('JSON.stringify(window.__mm.frame)');
    same = cur === last && cur !== '[]' ? same + 1 : 0;
    last = cur;
  }
};
const tp = async (g, x, y) => (
  await g.teleport(x, y, { settleMs: 0 }),
  await settleFrame(g),
  snap(g)
);

function frameChecks(s, tag) {
  const boxes = s.frame.map(boxOf);
  for (const b of boxes) {
    for (const cx of [b.left, b.right])
      for (const cy of [b.top, b.bottom])
        expect(Math.hypot(cx - s.r, cy - s.r) <= s.r + 0.5, `${tag} ${b.t} outside circle`);
    expect(Math.abs(b.px / s.dpr - 10) <= 0.6, `${tag} ${b.t} font ${b.px}px / dpr ${s.dpr}`);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      expect(
        !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top),
        `${tag} ${a.t} overlaps ${b.t}`,
      );
    }
  return boxes;
}

async function whitePixels(g, boxes) {
  return g.cdp
    .eval(`(() => { const x = document.querySelector('canvas.minimap').getContext('2d'); let hits = 0;
    for (const f of ${JSON.stringify(boxes)}) { const d = x.getImageData(Math.max(0, Math.floor(f.left)), Math.max(0, Math.floor(f.top)),
      Math.max(1, Math.ceil(f.right - f.left)), Math.ceil(f.bottom - f.top)).data; let w = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i+1] > 245 && d[i+2] > 245) w++; if (w >= 8) hits++; } return hits; })()`);
}

// Boundary: tiles whose right edge is a region edge and whose left/bottom lines are clean. The baked line is the
// last image px of the tile (right quarter): compare brightness there with the tile's interior (3rd quarter).
const EDGES = (cx, cy, rad) => `(async () => {
  const W = await import('/src/features/world/index.ts'), E = W.regionEdges();
  const out = [], ctl = [];
  for (let y = ${cy} - ${rad}; y <= ${cy} + ${rad}; y++) for (let x = ${cx} - ${rad}; x <= ${cx} + ${rad}; x++) {
    if (x < 2 || y < 2 || x >= E.width - 2 || y >= E.height - 2) continue;
    const b = E.edges[y * E.width + x], l = E.edges[y * E.width + x - 1];
    if (!W.WORLD_DEF.terrainAt(x, y) || !W.WORLD_DEF.terrainAt(x + 1, y)) continue;
    if ((b & 3) === 1 && (l & 3) === 0) out.push([x, y]);
    else if (b === 0 && l === 0 && x % 3 === 0 && y % 3 === 0) ctl.push([x, y]);
  }
  return { out, ctl };
})()`;

async function boundaryCheck(g) {
  // find an edge cluster: scan outward from spawn for a clean vertical edge, teleport there
  const found = await g.cdp.eval(EDGES(18, 15, 40));
  expect(found.out.length >= 3, `only ${found.out.length} clean region edges near spawn`);
  const [ex, ey] = found.out[0];
  const s2 = await tp(g, ex, ey);
  const rad = Math.floor((s2.r / s2.s) * 0.7);
  const local = await g.cdp.eval(EDGES(ex, ey, rad));
  const sample = (list) =>
    g.cdp
      .eval(`(() => { const x = document.querySelector('canvas.minimap').getContext('2d'); const res = [];
      for (const [tx, ty] of ${JSON.stringify(list.slice(0, 40))}) {
        const cx = ${s2.r} + (tx - ${s2.pos.x}) * ${s2.s}, cy = ${s2.r} + (ty - ${s2.pos.y}) * ${s2.s};
        if (Math.hypot(cx - ${s2.r}, cy - ${s2.r}) > ${s2.r} - ${s2.s * 2}) continue;
        const px = (fx) => x.getImageData(Math.floor(cx + fx * ${s2.s}), Math.floor(cy), 1, 1).data;
        const sum = (d) => d[0] + d[1] + d[2], a = px(0.375), b = px(-0.125), c = px(-0.375);
        // pixels must be terrain (opaque) and interior samples equal (same terrain, no marker)
        if (Math.abs(sum(b) - sum(c)) > 6) continue;
        res.push(sum(a) - sum(b)); } return res; })()`);
  const on = await sample(local.out),
    off = await sample(local.ctl);
  expect(on.length >= 3, `only ${on.length} usable edge samples (cand ${local.out.length})`);
  const bright = on.filter((d) => d >= 24).length;
  const ctlBright = off.filter((d) => d >= 24).length;
  expect(bright / on.length >= 0.75, `edge pixels brighter on ${bright}/${on.length}: ${on}`);
  expect(
    ctlBright / Math.max(1, off.length) <= 0.15,
    `controls brightened ${ctlBright}/${off.length}: ${off}`,
  );
  return `edge tiles brighter ${bright}/${on.length} (deltas ${on.slice(0, 6)}), non-edge controls ${ctlBright}/${off.length} (${off.slice(0, 6)})`;
}

async function runViewport(g, vp, dsf) {
  const tag = `${vp}-dpr${dsf}`;
  const v =
    vp === 'phone'
      ? { width: 390, height: 844, mobile: true }
      : { width: 1280, height: 800, mobile: false };
  // forEachCombo loaded at the lib's dpr (desktop 1, phone 2): the font check needs dpr 3 on phone, so reload there.
  const cur = await g.cdp.eval('window.devicePixelRatio');
  if (cur !== dsf) {
    await g.cdp.send('Emulation.setDeviceMetricsOverride', { ...v, deviceScaleFactor: dsf });
    await g.load();
  }

  await check(
    `${tag}-wilds-walk`,
    `${tag}: walking south from spawn, "The Wilds" label appears on the minimap`,
    async () => {
      let s = await tp(g, 18, 15);
      const wilds = s.labels.filter((l) => l.text === 'The Wilds');
      expect(wilds.length > 0, 'no The Wilds label in WORLD_DEF');
      const near = wilds
        .filter((l) => l.y > 15)
        .sort((a, b) => Math.hypot(a.x - 18, a.y - 15) - Math.hypot(b.x - 18, b.y - 15))[0];
      expect(near, 'no The Wilds label south of spawn');
      const radTiles = s.r / s.s,
        d0 = Math.hypot(near.x - 18, near.y - 15);
      const isNear = (f, w) => {
        const ax = s.r + (w.x - s.pos.x) * s.s,
          ay = s.r + (w.y - s.pos.y) * s.s;
        return (
          Math.abs(f.x - ax) <= 0.4 * f.w + 1 && Math.abs(f.y - ay) <= 2 * (f.h || 14 * s.dpr) + 1
        );
      };
      const drawnNear = () => s.frame.some((f) => f.t === 'The Wilds' && isNear(f, near));
      const drawnAtSpawn = drawnNear();
      // walk with real minimap taps toward it (clamped to the circle edge) until drawn
      let steps = 0;
      while (!drawnNear() && steps++ < 25) {
        const dx = near.x - s.pos.x,
          dy = near.y - s.pos.y,
          dist = Math.hypot(dx, dy),
          k = Math.min(1, (radTiles * 0.8) / dist);
        const tx = s.rect.w / 2 + (dx * k * s.s) / s.dpr,
          ty = s.rect.h / 2 + (dy * k * s.s) / s.dpr;
        await g.tap(s.rect.x + tx, s.rect.y + ty);
        await g.waitFor(
          () => g.cdp.eval('window.__idleRpg.store.getState().game.movement.path.length === 0'),
          { timeoutMs: 15000, label: 'walk done' },
        );
        await settleFrame(g); // trail glide finished (was a fixed 250 ms)
        s = await snap(g);
      }
      const f = s.frame.find((x) => x.t === 'The Wilds' && isNear(x, near));
      expect(
        f,
        `The Wilds never drawn; pos ${JSON.stringify(s.pos)} target ${near.x},${near.y} drawn=${s.frame.map((x) => x.t)}`,
      );
      const b = boxOf(f);
      for (const cx of [b.left, b.right])
        expect(Math.hypot(cx - s.r, f.y - s.r) <= s.r, 'label outside circle');
      // the layout nudges a label up to 2 rows / 0.4 widths off its anchor to keep the box inside the circle
      // A label forced under the player marker is drawn at alpha 0.4 on purpose (layoutLabels): never pure white.
      if (b.a >= 0.99) expect((await whitePixels(g, [b])) === 1, 'label has no white text pixels');
      return `anchor ${near.x},${near.y} (${d0.toFixed(0)} tiles from spawn, drawnAtSpawn=${drawnAtSpawn}); drawn after ${steps - 1} taps at pos ${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)}, label px ${f.x.toFixed(0)},${f.y.toFixed(0)} r=${s.r}`;
    },
  );

  const first = await snap(g);
  const regions = first.labels;
  for (const l of regions) {
    await check(
      `${tag}-label-${l.i}`,
      `${tag}: region label #${l.i} "${l.text}" (${l.x},${l.y}) drawn inside circle, disjoint`,
      async () => {
        const s = await tp(g, l.x, l.y);
        const drawn = s.frame.filter((f) => f.t === l.text);
        expect(
          drawn.length > 0,
          `"${l.text}" not drawn at its anchor; drawn=${s.frame.map((f) => f.t)}; r=${s.r} s=${s.s} dpr=${s.dpr} anchorPx=${l.px.toFixed(0)},${l.py.toFixed(0)} pos=${s.pos.x},${s.pos.y}`,
        );
        const nearest = drawn.sort(
          (a, b) => Math.hypot(a.x - s.r, a.y - s.r) - Math.hypot(b.x - s.r, b.y - s.r),
        )[0];
        const boxes = frameChecks(s, `#${l.i}`);
        const solid = boxes.filter((b) => b.a >= 0.99); // faded (under the player, alpha 0.4) labels are never pure white
        expect((await whitePixels(g, solid)) === solid.length, 'some labels have no white pixels');
        return `${boxes.length} labels drawn, "${l.text}" centre offset ${Math.round(nearest.x - s.r)},${Math.round(nearest.y - s.r)}; font ${boxes[0].px}px/dpr${s.dpr}`;
      },
    );
  }
  await check(`${tag}-boundaries`, `${tag}: region boundary lines painted along known edges`, () =>
    boundaryCheck(g),
  );
}

await withGame(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [SPY] },
  forEachCombo(COMBOS, (g, vp) => runViewport(g, vp, vp === 'phone' ? 3 : 1)),
);
