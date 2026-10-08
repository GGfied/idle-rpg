// Minimap labels e2e: region + bank labels drawn legibly (10 CSS px), inside the circle, no overlaps, per area.
// Spies fillText/strokeText on the minimap canvas (the last frame = calls after the last clearRect).
// Run: node tests/e2e/minimapLabels.e2e.mjs   (SHOTS_DIR=... saves minimap PNGs)
// Fast base: the 3 runs (desktop dpr1, desktop dpr2, phone dpr3) are parallel children, ?tickMs=60, the fillText spy
// goes in before the first load (initScripts), and "minimap settled" waits on the drawn label positions holding still
// (the minimap redraws every rAF) instead of a fixed 2.8 s glide sleep + 250 ms. Budget 60 s.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, expect, runParallel, VIEWPORTS, waitStill, withCombos } from './lib.mjs';

// File-local viewports (one runParallel child each); same sizes as before, the dpr is the variable under test.
const RUNS = {
  mmDesktopDpr1: { vp: 'desktop', dsf: 1 },
  mmDesktopDpr2: { vp: 'desktop', dsf: 2 },
  mmPhoneDpr3: { vp: 'phone', dsf: 3 },
};
for (const [name, { vp, dsf }] of Object.entries(RUNS)) VIEWPORTS[name] = { ...VIEWPORTS[vp], dsf };
const PORT = 9316; // C7 port block 9301-9350; 3 combos use 9316-9318
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: Object.keys(RUNS),
  renderers: ['webgl'], // the minimap is a 2D DOM canvas: the Phaser renderer does not draw it
  budgetMs: BUDGET_MS,
});

const SPY = `(() => {
  const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { calls: [], frame: [], last: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') { window.__mm.last = window.__mm.frame; window.__mm.frame = []; } return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') {
    window.__mm.frame.push({ t, x, y, a: this.globalAlpha, font: this.font, align: this.textAlign, w: this.measureText(t).width }); }
    return of.call(this, t, x, y); };
})();`;

// In-page: snapshot of last frame + independent expectation of every label's anchor px.
const SNAP = `(async () => {
  const W = await import('/src/features/world/index.ts');
  const cv = document.querySelector('canvas.minimap'), css = cv.clientWidth, dpr = cv.width / css;
  const r = cv.width / 2, s = 4 * (css / 160) * dpr;
  const pos = window.__idleRpg.store.getState().game.movement.position;
  const frame = window.__mm.last.slice(); // last COMPLETE frame (calls between two clearRects)
  const labels = W.WORLD_DEF.labels.map((l) => ({ text: l.text, kind: l.kind, px: r + (l.x - pos.x) * s, py: r + (l.y - pos.y) * s }));
  const rc = cv.getBoundingClientRect();
  return { frame, labels, r, dpr, css, pos, canvasW: cv.width, rect: { x: rc.left, y: rc.top, w: rc.width, h: rc.height } };
})()`;

const boxOf = (f) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(f.font)[1]);
  const left = f.align === 'center' ? f.x - f.w / 2 : f.x;
  return { left, right: left + f.w, top: f.y - px / 2, bottom: f.y + px / 2, px, a: f.a ?? 1 };
};

/** Minimap settled: the last complete frame's label draw positions hold still (waitStill: 2 x 100 ms). */
async function snap(g) {
  await waitStill(
    () =>
      g.cdp.eval(
        `(() => { const f = window.__mm.last; let x = f.length * 1000, y = 0; for (const c of f) { x += c.x; y += c.y; } return { x, y }; })()`,
      ),
    { intervalMs: 100, stable: 2, max: 80 },
  );
  return g.cdp.eval(SNAP);
}

async function whereAt(g, name, tile) {
  if (tile) {
    await g.teleport(tile[0], tile[1], { settleMs: 0 }); // the trail glide is waited out by snap()
  }
  const s = await snap(g);
  const shot = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: s.rect.x, y: s.rect.y, width: s.rect.w, height: s.rect.h, scale: 1 },
  });
  const dir = process.env.SHOTS_DIR;
  let file = '';
  if (dir) {
    mkdirSync(dir, { recursive: true });
    file = resolve(dir, `minimapLabels-${name}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
  }
  return { s, file };
}

function generic(id, s, tag) {
  const drawn = new Map();
  for (const f of s.frame) drawn.set(f.t, f);
  const boxes = s.frame.map((f) => ({ t: f.t, ...boxOf(f) }));
  return { drawn, boxes, tag, id };
}

async function checks(g, vp, area, s, file, expectDrawn, expectAbsent, iconOnly = []) {
  const { drawn, boxes } = generic(area, s, vp);
  await check(`${area}-shown`, `${area}: expected labels drawn`, async () => {
    if (expectDrawn.length === 0)
      expect(
        [...drawn.keys()].some((t) => !/ Bank$/.test(t)),
        `no region label drawn; drawn=${[...drawn.keys()]}`,
      );
    for (const t of expectDrawn)
      expect(
        drawn.has(t),
        `"${t}" not drawn; drawn=${[...drawn.keys()]} pos=${JSON.stringify(s.pos)} r=${s.r} anchors=${JSON.stringify(s.labels.map((l) => [l.text, Math.round(l.px), Math.round(l.py)]))}`,
      );
    return `${vp} dpr${s.dpr}: drawn=[${[...drawn.keys()]}] pos=${JSON.stringify(s.pos)} shot=${file}`;
  });
  if (iconOnly.length)
    await check(
      `${area}-icon`,
      `${area}: small minimap shows ${iconOnly} as coin icon only`,
      async () => {
        for (const t of iconOnly) {
          expect(!drawn.has(t), `"${t}" name drawn but expected icon only`);
          const l = s.labels.find((x) => x.text === t);
          const gold = await g.cdp
            .eval(`(() => { const x = document.querySelector('canvas.minimap').getContext('2d'), d = ${s.dpr * 5};
          const a = x.getImageData(Math.round(${l.px} - d), Math.round(${l.py} - d), Math.round(2 * d), Math.round(2 * d)).data; let n = 0;
          for (let i = 0; i < a.length; i += 4) if (a[i] > 240 && a[i+1] > 190 && a[i+1] < 225 && a[i+2] < 100) n++; return n; })()`);
          expect(gold >= 10, `no gold coin pixels at ${t} anchor (${gold})`);
        }
        return `icon-only ok: ${iconOnly}`;
      },
    );
  await check(`${area}-absent`, `${area}: far labels not drawn`, async () => {
    for (const t of expectAbsent) expect(!drawn.has(t), `"${t}" drawn but should be off map`);
    return `absent ok: ${expectAbsent}`;
  });
  await check(`${area}-legible`, `${area}: font ${'10'} CSS px at dpr ${s.dpr}`, async () => {
    expect(boxes.length > 0, 'no labels');
    for (const b of boxes)
      expect(Math.abs(b.px / s.dpr - 10) <= 0.6, `${b.t}: ${b.px}px / dpr ${s.dpr}`);
    return `font px ${boxes.map((b) => b.px)} / dpr ${s.dpr} = ${(boxes[0].px / s.dpr).toFixed(2)} CSS px`;
  });
  await check(
    `${area}-inside`,
    `${area}: every drawn label box inside circle, and all in-range anchors drawn`,
    async () => {
      for (const b of boxes)
        for (const cx of [b.left, b.right])
          for (const cy of [b.top, b.bottom]) {
            const d = Math.hypot(cx - s.r, cy - s.r);
            expect(d <= s.r + 0.5, `${b.t} corner ${cx},${cy} outside circle r=${s.r}`);
          }
      // far-outside anchors (beyond radius+5 css px of box) must never be drawn
      for (const l of s.labels) {
        const dist = Math.hypot(l.px - s.r, l.py - s.r);
        // Region labels are nudged up to 2 box heights / 0.4 box widths to fit inside the circle (layoutLabels),
        // so their anchor may sit that far outside; facility labels are never nudged.
        const b = boxes.find((x) => x.t === l.text);
        const slack =
          l.kind === 'region' && b
            ? 2 * (b.bottom - b.top + 4 * s.dpr) + 0.4 * (b.right - b.left)
            : 0;
        // Several labels can share a text ("The Wilds" x10): the draw is explained by any same-text anchor in range.
        const explained = s.labels.some(
          (x) => x.text === l.text && Math.hypot(x.px - s.r, x.py - s.r) <= s.r + 1 + slack,
        );
        if (dist > s.r + 1 + slack && !explained)
          expect(!drawn.has(l.text), `${l.text} anchor outside circle yet drawn`);
      }
      return `${boxes.length} boxes inside r=${s.r}`;
    },
  );
  await check(`${area}-overlap`, `${area}: no two labels overlap`, async () => {
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const ov = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(!ov, `${a.t} overlaps ${b.t}`);
      }
    return `${boxes.length} labels pairwise disjoint`;
  });
  await check(`${area}-pixels`, `${area}: white label text pixels really painted`, async () => {
    // Labels forced under the player marker are drawn at alpha 0.4 on purpose (never pure white): not counted.
    const solid = boxes.filter((b) => b.a >= 0.99);
    const n = await g.cdp
      .eval(`(() => { const c = document.querySelector('canvas.minimap'), x = c.getContext('2d');
      let hits = 0; for (const f of ${JSON.stringify(solid)}) { const w = Math.max(1, Math.ceil(f.right - f.left)), h = Math.ceil(f.bottom - f.top);
        const d = x.getImageData(Math.max(0, Math.floor(f.left)), Math.max(0, Math.floor(f.top)), w, h).data; let white = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i+1] > 245 && d[i+2] > 245 && d[i+3] > 245) white++;
        if (white >= 8) hits++; } return hits; })()`);
    expect(n === solid.length, `${n}/${solid.length} solid label boxes contain white text pixels`);
    return `${n}/${solid.length} solid boxes have white pixels (${boxes.length - solid.length} faded)`;
  });
}

await withCombos(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [SPY] },
  COMBOS,
  async (g, name) => {
    const { vp, dsf } = RUNS[name];
    const tag = `${vp}-dpr${dsf}`;
    const spawn = await whereAt(g, `${tag}-spawn`, [18, 15]); // fresh-save spawn tile (explicit: load() sometimes kept the old tile)
    const small = vp === 'phone'; // small minimap: facility = coin icon only (decision)
    await checks(
      g,
      tag,
      'spawn',
      spawn.s,
      spawn.file,
      small ? [] : ['Willowbrook Green'], // small: names that don't fit are skipped; need >= 1 region label
      ['Fernhaven', 'Fernhaven Bank', 'Greatmere'],
      ['Willowbrook Bank'], // the name would cross the player keep-out here, so the coin icon wins (layoutLabels)
    );
    const ww = await whereAt(g, `${tag}-whispering`, [50, 14]);
    await checks(
      g,
      tag,
      'whispering',
      ww.s,
      ww.file,
      ['Whispering Wood'],
      ['Willowbrook Bank', 'Fernhaven', 'Fernhaven Bank'],
    );
    const fh = await whereAt(g, `${tag}-fernhaven`, [102, 68]);
    await checks(
      g,
      tag,
      'fernhaven',
      fh.s,
      fh.file,
      ['Fernhaven'],
      ['Willowbrook Green', 'Willowbrook Bank', 'Whispering Wood'],
    );
    const m0 = await snap(g); // put the bank anchor 0.7r left of centre so its name can fit in the circle
    const fbx = Math.round(94 + (0.7 * m0.r) / (4 * (m0.css / 160) * m0.dpr));
    const fb = await whereAt(g, `${tag}-fernhavenbank`, [fbx, 70]); // 8 tiles south of the bank so its name clears the player keep-out
    await checks(
      g,
      tag,
      'fernbank',
      fb.s,
      fb.file,
      small ? [] : ['Fernhaven Bank'], // phone: the small circle can't fit the name, so only the coin icon (decision)
      ['Willowbrook Green', 'Willowbrook Bank', 'Whispering Wood'],
      small ? ['Fernhaven Bank'] : [],
    );
  },
);
