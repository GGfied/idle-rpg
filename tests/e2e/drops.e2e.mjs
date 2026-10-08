// QA slice: ground drops pile offsets + icon preload (P3 #18).
// Fast base: runParallel desktop + phone, fast ticks. webgl only: every check reads the scene graph (texture key,
// container x/y), which is renderer-independent; no pixel is asserted, so a canvas child would add no coverage.
// teleportSettled + "views stopped moving" waits instead of fixed 2.6 s / 400 ms sleeps, budget 60 s.
// Run: node tests/e2e/drops.e2e.mjs
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9451; // combos use 9451..9452
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const VIEWS = `(() => { const sc = window.__idleRpg.scene().camera.scene;
  return sc.children.list.filter((c) => c.type === 'Container' && c.list?.[0]?.texture?.key === 'ground_shadow' && c.visible && c.active)
    .map((c) => ({ x: c.x, y: c.y, key: c.list[1].texture.key })); })()`;
// Sample the ground view texture key synchronously on the first rendered frame after the drop.
const DROP_FIRST_FRAME = (
  slot,
) => `new Promise((res) => { window.__idleRpg.store.getState().dropSlot(${slot});
  const t0 = performance.now(); const tick = () => { const v = ${VIEWS}; if (v.length || performance.now() - t0 > 1500) res(v); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  vp = `${vp}-${renderer}`; // label for evidence + shot names (no '/': SHOTS_DIR file names)
  // The drop settle tween moves a new view for a few hundred ms: wait until every view is still (2 equal samples).
  const stillViews = async () => {
    let prev = '';
    await g.waitFor(
      async () => {
        const cur = JSON.stringify(await g.eval(VIEWS));
        const same = cur === prev;
        prev = cur;
        return same;
      },
      { label: 'ground views still', intervalMs: 80 },
    );
  };
  const lane =
    await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const gr = CONTENT.grid; const s = window.__e.game().movement.position;
      for (let r = 0; r < 12; r++) for (let x = s.x - r; x <= s.x + r; x++) for (let y = s.y - r; y <= s.y + r; y++) { let ok = true;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (!gr.isWalkable(x + dx, y + dy)) ok = false; if (ok) return { x, y }; } })()`);
  expect(lane, 'no open area');
  await g.setInventory(['logs', 'coal', 'raw_shrimp']);
  await g.teleportSettled(lane.x, lane.y);
  const keys = [];
  for (const [i, id] of ['logs', 'coal', 'raw_shrimp'].entries()) {
    await check(
      `d${i + 1}`,
      `drop #${i + 1} (${id}): real icon first frame, drawn at a front offset`,
      async () => {
        const slot = (await g.state('inventory.slots')).findIndex((s) => s && s.itemId === id);
        expect(slot >= 0, `${id} not in inventory`);
        const before = (await g.eval(VIEWS)).length;
        const v = await g.eval(DROP_FIRST_FRAME(slot));
        expect(v.length === before + 1, `views ${before}->${v.length}`);
        const mine = v.find((x) => !keys.includes(`${x.x},${x.y}`));
        expect(mine, 'new view not found');
        keys.push(`${mine.x},${mine.y}`);
        expect(mine.key === `item_icon_${id}`, `texture key ${mine.key} (want item_icon_${id})`);
        await stillViews();
        const w = await g.eval(
          `(async()=>{const {isoProjection}=await import('/src/render/projection.ts');return isoProjection.tileToWorld(${lane.x},${lane.y});})()`,
        );
        const all = await g.eval(VIEWS);
        const offs = all.map((a) => `${Math.round(a.x - w.x)},${Math.round(a.y - w.y)}`);
        expect(
          all.every((a) => Math.abs(a.x - w.x) >= 0 && (Math.abs(a.x - w.x) > 9 || a.y - w.y >= 5)),
          `offsets ${offs}`,
        );
        await g.screenshot(`${vp}-${i + 1}`);
        return `${vp}: key ${mine.key}, offsets ${offs.join(' | ')}`;
      },
    );
  }
  await check('tap', 'tapping the pile tile opens/takes (ground item menu or pickup)', async () => {
    const before = (await g.state('ground.items')).length;
    const w = await g.eval(
      `(async()=>{const {isoProjection}=await import('/src/render/projection.ts');return isoProjection.tileToWorld(${lane.x},${lane.y});})()`,
    );
    await g.teleportSettled(lane.x + 2, lane.y);
    const pt = await g.page(`toClient(${w.x}, ${w.y})`);
    await g.tap(pt.x, pt.y);
    await g.waitFor(async () => (await g.state('ground.items')).length < before, {
      label: 'pickup',
    });
    return `${vp}: ground ${before} -> ${(await g.state('ground.items')).length}`;
  });
});
