// Minimap rock/spot markers + net spot art (no box). Shots in SHOTS_DIR (default tests/e2e/.shots-mmnet).
// Run: node tests/e2e/mmnet.e2e.mjs (ports 9407-9408, E2E_PORT overrides; fast base: parallel desktop + phone children,
// ?tickMs=60, wait-on-state, budget 60 s). The minimap is a 2D canvas (not Phaser), so one renderer is enough.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';

const PORT = 9407;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
// Spy: the first drawImage of each minimap frame (the terrain blit); its rect moves while the minimap trail glides.
const BLIT_SPY = `(() => { const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, od = P.drawImage; window.__blit = null; let fresh = true;
  const mine = (c) => c.canvas && c.canvas.className === 'minimap';
  P.clearRect = function (...a) { if (mine(this)) fresh = true; return oc.apply(this, a); };
  P.drawImage = function (...a) { if (mine(this) && fresh) { fresh = false; window.__blit = a.slice(1).map(Number); } return od.apply(this, a); }; })();`;
/** Teleport, then wait until the minimap is drawn centred on the new tile (replaces fixed 400-500 ms sleeps). */
async function teleportMm(g, x, y) {
  await g.teleport(x, y, { settleMs: 0 });
  await g.waitTicks(2); // the minimap trail only moves on a new tick
  await waitStill(
    async () => {
      const b = (await g.eval('window.__blit')) ?? [];
      return { x: b.reduce((a, v) => a + v, 0) + b.length * 1000, y: 0 };
    },
    { intervalMs: 100, stable: 2, eps: 0.01 },
  );
}
/** Precondition: no fishing-spot hops (60-120 ticks = 3.6-7.2 s at 60 ms ticks) while a check reads spot tiles. */
const freezeHops = (g) =>
  g.update(`({ ...g, fishing: { ...g.fishing, spots: Object.fromEntries(Object.entries(g.fishing.spots).map(
    ([k, s]) => [k, { ...s, moveTimer: { respawnAt: g.tick + 1e9 } }])) } })`);

const SHOTS = process.env.SHOTS_DIR ?? 'tests/e2e/.shots-mmnet';
mkdirSync(SHOTS, { recursive: true });

// In-page: pixels of canvas.minimap within `tol` of rgb, inside a window around (cx,cy) -> {n, x, y}
const PROBE = `window.__probe = (rgb, cx, cy, half, tol) => { const c = document.querySelector('canvas.minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0; for (let y = Math.max(0, Math.round(cy - half)); y < Math.min(c.height, cy + half); y++) for (let x = Math.max(0, Math.round(cx - half)); x < Math.min(c.width, cx + half); x++) { const i = (y * c.width + x) * 4;
    if (Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol && d[i + 3] > 200) { n++; sx += x; sy += y; } }
  return { n, x: n ? sx / n : null, y: n ? sy / n : null, w: c.width }; }; 0`;

async function shot(g, name, clip) {
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { ...clip, scale: clip.scale ?? 3 } } : {}),
  });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
}
const expectedPx = async (g, tx, ty) => {
  // minimap is centred on the player, north up, px/40 canvas px per tile
  const me = await g.state('movement.position');
  const w = await g.eval(`document.querySelector('canvas.minimap').width`);
  const s = w / 40;
  return { x: w / 2 + (tx - me.x) * s, y: w / 2 + (ty - me.y) * s, s, w };
};
const probe = (g, rgb, p, half = 6, tol = 14) =>
  g.eval(`window.__probe(${JSON.stringify(rgb)}, ${p.x}, ${p.y}, ${half}, ${tol})`);

await withCombos(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [BLIT_SPY] },
  COMBOS,
  async (g, vp) => {
    await g.eval(PROBE);
    const mm = async (name) => {
      const r = await g.rect('canvas.minimap');
      await shot(g, `${vp}-${name}`, { x: r.left, y: r.top, width: r.w, height: r.h, scale: 3 });
    };
    await check(
      'a',
      'quarry: ore squares on minimap, distinct from trees; depleted dims',
      async () => {
        await g.setInventory(['bronze_pickaxe']);
        await teleportMm(g, 74, 44);
        await g.eval(PROBE);
        const kinds = [
          ['copper', [232, 138, 44], 73, 41],
          ['coal', [22, 22, 26], 76, 42],
          ['iron', [168, 69, 47], 77, 45],
        ];
        const out = [];
        for (const [k, rgb, tx, ty] of kinds) {
          const p = await expectedPx(g, tx, ty);
          const r = await probe(g, rgb, p, 5, 12);
          expect(r.n >= 2, `${k} square not found near (${p.x | 0},${p.y | 0}) n=${r.n}`);
          out.push(`${k}:${r.n}px`);
        }
        // a rock is not a tree dot: no tree-green (31,157,58) at rock centre
        const pc = await expectedPx(g, 73, 41);
        const green = await probe(g, [31, 157, 58], pc, 2, 10);
        expect(green.n === 0, `tree green at rock tile n=${green.n}`);
        await mm('quarry-before');
        // mine quarry_copper_4 (77,43) till depleted (not copper_3 at 74,43: the player arrow at 74,44 covers it)
        const p3 = await expectedPx(g, 77, 43);
        const before = await probe(g, [232, 138, 44], p3, 3, 12);
        expect(before.n >= 2, `copper_4 pre n=${before.n}`);
        await g.store(`s.interactTree('quarry_copper_4')`);
        await g.waitFor(
          async () => {
            const n = await g.eval(
              `window.__idleRpg.store.getState().game.gathering.nodes['quarry_copper_4']`,
            );
            return n && n.respawnAt != null && n.respawnAt !== undefined;
          },
          { timeoutMs: 40000, label: 'rock depleted' },
        );
        let after = await probe(g, [232, 138, 44], p3, 3, 12);
        await g
          .waitFor(async () => (after = await probe(g, [232, 138, 44], p3, 3, 12)).n < before.n, {
            timeoutMs: 2000,
            label: 'depleted rock dimmed',
          })
          .catch(() => {}); // the check below reports the numbers
        await mm('quarry-depleted');
        return (
          `${out.join(' ')} no-tree-green; copper_4 full-colour px ${before.n} -> ${after.n} when depleted` +
          (after.n < before.n
            ? ''
            : (() => {
                throw new Error(`not dimmed ${before.n}->${after.n}`);
              })())
        );
      },
    );

    await check('b', 'shore: spot markers at current tiles; hop moves the marker', async () => {
      await teleportMm(g, 57, 52);
      await g.waitState('fishing.spots', 's => s && s.shore_net_1 && s.shore_bait_1', {
        label: 'shore spots tracked',
      });
      await freezeHops(g); // the forced hop below is then the only one (the old test tolerated random hops)
      const spotsNow = () =>
        g.eval(
          `(() => { const g = window.__idleRpg.store.getState().game; return g.fishing.spots; })()`,
        );
      let sp = await spotsNow();
      expect(sp.shore_net_1 && sp.shore_bait_1, 'spots not tracked yet');
      const tiles = {
        shore_net_1: [56, 58, 60, 59],
        shore_bait_1: [48, 50, 52, 54],
      };
      const where = async () => ({
        net: { x: tiles.shore_net_1[(await spotsNow()).shore_net_1.tile], y: 51 },
        bait: { x: tiles.shore_bait_1[(await spotsNow()).shore_bait_1.tile], y: 51 },
      });
      const net = [191, 239, 255];
      const bait = [30, 107, 255];
      const w0 = await where();
      const pn = await expectedPx(g, w0.net.x, 51);
      const pb = await expectedPx(g, w0.bait.x, 51);
      const rn = await probe(g, net, pn, 6, 12);
      const rb = await probe(g, bait, pb, 6, 12);
      expect(rn.n >= 3, `net marker missing at ${pn.x | 0},${pn.y | 0} n=${rn.n}`);
      expect(rb.n >= 3, `bait marker missing at ${pb.x | 0},${pb.y | 0} n=${rb.n}`);
      await mm('shore-before');
      // force hop: index+1 of net_1 (keep it at a known value; the hop timer may also fire)
      const cur = (await spotsNow()).shore_net_1.tile;
      const nxt = (cur + 1) % 4;
      await g.update(
        `({ ...g, fishing: { ...g.fishing, spots: { ...g.fishing.spots, shore_net_1: { ...g.fishing.spots.shore_net_1, tile: ${nxt} } } } })`,
      );
      const w1 = await where();
      const p1 = await expectedPx(g, w1.net.x, 51);
      let r1 = await probe(g, net, p1, 6, 12);
      await g
        .waitFor(async () => (r1 = await probe(g, net, p1, 6, 12)).n >= 3, {
          timeoutMs: 2000,
          label: 'net marker redrawn at the new tile',
        })
        .catch(() => {}); // the expect below reports the numbers
      expect(r1.n >= 3, `net marker not at new tile ${w1.net.x}: n=${r1.n}`);
      if (w1.net.x !== w0.net.x) {
        const old = await probe(g, net, pn, 2, 12);
        expect(old.n === 0, `marker still at old tile n=${old.n}`);
      }
      await mm('shore-after');
      return `net ${w0.net.x}->${w1.net.x} tile; px found ${rn.n} then ${r1.n}; bait at ${w0.bait.x} n=${rb.n}`;
    });

    await check('d', 'oak and normal tree markers differ on the minimap', async () => {
      await teleportMm(g, 24, 24);
      await g.eval(PROBE);
      const oaks = [
        [22, 21],
        [24, 22],
        [23, 23],
        [26, 20],
      ];
      let oakPx = 0;
      let brown = 0;
      for (const [x, y] of oaks) {
        const p = await expectedPx(g, x, y);
        oakPx += (await probe(g, [24, 137, 47], p, 4, 8)).n;
        brown += (await probe(g, [138, 90, 43], p, 4, 10)).n;
      }
      const w = await g.eval(`document.querySelector('canvas.minimap').width`);
      const light = await probe(g, [95, 211, 107], { x: w / 2, y: w / 2 }, w / 2, 8);
      await mm('trees');
      expect(oakPx > 0 && brown > 0, `oak dark-green ${oakPx} / brown ring ${brown} px`);
      expect(light.n > 0, `no light-green normal-tree px in view`);
      return `oak dark-green ${oakPx}px + brown ring ${brown}px at the 4 oaks; normal light-green ${light.n}px in view`;
    });

    await check('c', 'net spot close-up captured (visual check, no box)', async () => {
      // Freeze hops by pushing the spot move timers (the old setTickMs(3600000) is clamped to 600 by the DEV hook).
      await g.teleportSettled(57, 52);
      await g.waitState('fishing.spots', 's => s && s.shore_net_1 && s.shore_bait_1', {
        label: 'shore spots tracked',
      });
      await freezeHops(g);
      const sp = await g.eval(`window.__idleRpg.store.getState().game.fishing.spots`);
      const nx = [56, 58, 60, 59][sp.shore_net_1.tile];
      const bx = [48, 50, 52, 54][sp.shore_bait_1.tile];
      await g.teleportSettled(nx - 3, 52);
      const pn = await g.tileClient(nx, 51);
      const pb = await g.tileClient(bx, 51);
      await shot(g, `${vp}-netspot`, {
        x: Math.max(0, Math.min(pn.x - 120, (await g.eval('innerWidth')) - 240)),
        y: Math.max(0, pn.y - 150),
        width: 120,
        height: 120,
        scale: 4,
      });
      await shot(g, `${vp}-baitspot`, {
        x: Math.max(0, Math.min(pb.x - 120, (await g.eval('innerWidth')) - 240)),
        y: Math.max(0, pb.y - 150),
        width: 120,
        height: 120,
        scale: 4,
      });
      await shot(g, `${vp}-shore-full`);
      return `net px ${pn.x | 0},${pn.y | 0} bait ${pb.x | 0},${pb.y | 0}`;
    });
  },
);
