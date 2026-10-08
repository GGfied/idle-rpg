// greatmere_east e2e: minimap label + entry banners via real taps. Run: node tests/e2e/greatmereEast.e2e.mjs (port 5231, SHOTS_DIR optional)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SPY = `(() => { const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { frame: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') window.__mm.frame = []; return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') window.__mm.frame.push({ t, x, y }); return of.call(this, t, x, y); }; })()`;

const banner = (g) => g.eval(`document.querySelector('.area-banner-title')?.textContent ?? null`);
// a horizontal/vertical pair of adjacent walkable tiles straddling a border, found from the real collision grid
const FIND = (
  axis,
  border,
  lo,
  hi,
) => `(async () => { const W = await import('/src/features/world/index.ts');
  const grid = W.createWorldCollisionGrid(); const out = [];
  for (let k = ${lo}; k <= ${hi}; k++) { const a = ${axis === 'x' ? `[${border - 1}, k]` : `[k, ${border - 1}]`}, b = ${axis === 'x' ? `[${border}, k]` : `[k, ${border}]`};
    if (grid.isWalkable(...a) && grid.isWalkable(...b)) out.push([a, b]); } return out; })()`;

async function shot(g, name, clipEl) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return '';
  mkdirSync(dir, { recursive: true });
  const clip = clipEl && (await g.rect(clipEl));
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip
      ? { clip: { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 } }
      : {}),
  });
  const f = resolve(dir, `greatmereEast-${name}.png`);
  writeFileSync(f, Buffer.from(data, 'base64'));
  return f;
}

async function crossInto(g, from, to, expectName) {
  await g.teleport(from[0], from[1], { settleMs: 1500 });
  const p0 = await g.state('movement.position');
  // tap the destination tile (real input), retry via hops if it is off-canvas
  await g.tapTile(to[0], to[1]);
  await g.waitFor(
    async () => {
      const p = await g.state('movement.position');
      return p.x === to[0] && p.y === to[1];
    },
    { label: `reach ${to}` },
  );
  await g.waitFor(async () => (await banner(g)) === expectName, {
    timeoutMs: 4000,
    label: `banner ${expectName}`,
  });
  return `${JSON.stringify(p0)}->${to} banner=${await banner(g)}`;
}

await withGame(
  { port: 5231 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await g.load();
    await check(`${vp}-mm`, 'minimap draws "Greatmere East" near its zone', async () => {
      await g.teleport(70, 45, { settleMs: 2800 });
      await g.sleep(300);
      const s = await g.eval(`(async () => { const W = await import('/src/features/world/index.ts');
        const cv = document.querySelector('canvas.minimap'), css = cv.clientWidth, dpr = cv.width / css, r = cv.width / 2, sc = 4 * (css / 160) * dpr;
        const pos = window.__idleRpg.store.getState().game.movement.position;
        const l = W.WORLD_DEF.labels.filter((l) => l.text === 'Greatmere East').map((l) => ({ x: l.x, y: l.y, px: r + (l.x - pos.x) * sc, py: r + (l.y - pos.y) * sc }));
        return { frame: window.__mm.frame.slice(), l, r }; })()`);
      const f = s.frame.find((q) => q.t === 'Greatmere East');
      const file = await shot(g, `${vp}-minimap`, 'canvas.minimap');
      expect(s.l.length === 1, `anchor labels: ${JSON.stringify(s.l)}`);
      expect(
        s.l[0].x >= 63 && s.l[0].x <= 79 && s.l[0].y >= 26 && s.l[0].y <= 51,
        `anchor outside zone ${JSON.stringify(s.l[0])}`,
      );
      expect(f, `not drawn; drawn=${s.frame.map((q) => q.t)}`);
      expect(
        Math.abs(f.x - s.l[0].px) < 40 && Math.abs(f.y - s.l[0].py) < 40,
        `drawn ${f.x},${f.y} far from anchor ${s.l[0].px},${s.l[0].py}`,
      );
      return `anchor tile ${s.l[0].x},${s.l[0].y} drawn px ${Math.round(f.x)},${Math.round(f.y)} shot=${file}`;
    });
    for (const [id, axis, border, lo, hi] of [
      ['west', 'x', 63, 28, 50, 'Greatmere East', 'Greatmere'],
      ['south', 'y', 52, 64, 78, 'Greatmere Shore', 'Greatmere East'],
    ]) {
      const pairs = await g.eval(FIND(axis, border, lo, hi));
      await check(`${vp}-${id}-pairs`, `walkable pair across ${axis}=${border}`, () => {
        expect(pairs.length > 0, 'no walkable pair');
        return `${pairs.length} pairs, using ${JSON.stringify(pairs[0])}`;
      });
      if (!pairs.length) continue;
      const [a, b] = pairs[Math.floor(pairs.length / 2)];
      // west: x62 (Greatmere) -> x63 gives East. south: y51 (East) -> y52 gives Shore.
      await check(
        `${vp}-${id}-in`,
        `tap across border shows "${axis === 'x' ? 'Greatmere East' : 'Greatmere Shore'}"`,
        async () => {
          const [from, to, name] =
            axis === 'x' ? [a, b, 'Greatmere East'] : [a, b, 'Greatmere Shore'];
          const ev = await crossInto(g, from, to, name);
          const f = await shot(g, `${vp}-banner-${id}`);
          return `${ev} shot=${f}`;
        },
      );
    }
    // walk out of East west to Greatmere (x62) when walkable
    const west = (await g.eval(FIND('x', 63, 28, 50)))[0];
    await check(`${vp}-out-west`, 'walk East -> x62 shows "Greatmere"', async () => {
      expect(west, 'no pair');
      return crossInto(g, west[1], west[0], 'Greatmere');
    });
  }),
);
