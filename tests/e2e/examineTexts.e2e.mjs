// Examine text per node kind via real right-click / long-press -> Examine; each posts its own chat line.
// Fast base: desktop + phone as parallel children (ports 9360-9361), ?tickMs=60, camera-settle waits, < 60 s budget.
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9360;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const CASES = [
  ['tree', 'tree', /common tree/i],
  ['oak_tree', 'tree', /oak/i],
  ['copper_rock', 'rock', /copper/i],
  ['tin_rock', 'rock', /tin/i],
  ['iron_rock', 'rock', /iron/i],
  ['coal_rock', 'rock', /coal/i],
  ['net_spot', 'spot', /small fish/i],
  ['bait_spot', 'spot', /deeper water/i],
];

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const phone = vp === 'phone';
  const locate = (defId, kind) =>
    g.eval(`(async()=>{const w=await import('/src/features/world/index.ts');const R=await import('/src/render/index.ts');
        const st=window.__idleRpg.store.getState().game;
        const pos=(s,tile)=>({x:tile.x,y:tile.y});
        if('${kind}'==='spot'){const s=w.FISHING_SPOTS.find(r=>r.defId==='${defId}');if(!s)return null;const i=st.fishing.spots[s.spotId]?.tile??0;const t=s.tiles[i]??s.tiles[0];return {x:t.x,y:t.y,up:(R.VIEW_HIT_BOUNDS[s.defId]||{up:12}).up,id:s.spotId}}
        const list='${kind}'==='tree'?w.WORLD_TREES:w.WORLD_ROCKS;const k=list.find(r=>r.defId==='${defId}');if(!k)return null;
        return {x:k.x,y:k.y,up:(R.VIEW_HIT_BOUNDS[k.defId]||{up:24}).up,id:k.nodeId}})()`);
  for (const [defId, kind, re] of CASES) {
    await check(`${defId}`, `examine ${defId} -> own chat line`, async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await g.closeOverlays();
        const t = await locate(defId, kind);
        if (!t) throw new Error(`no ${defId} in world`);
        await g.teleportSettled(t.x, t.y + 3); // waits for the camera, not a fixed 500 ms
        const t2 = kind === 'spot' ? await locate(defId, kind) : t;
        const p = await g.tileClient(t2.x, t2.y, -t.up / 2);
        if (!(await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`))) continue;
        if (phone) await g.longPress(p.x, p.y);
        else await g.rightClick(p.x, p.y);
        const ok = await g
          .waitFor(() => g.eval(`!!document.querySelector('.menu-item')`), {
            timeoutMs: 2000,
            label: 'menu',
          })
          .then(
            () => true,
            () => false,
          );
        if (!ok) continue;
        const rows = await g.eval(
          `[...document.querySelectorAll('.menu-item')].map(e=>e.textContent)`,
        );
        const idx = rows.findIndex((r) => /^examine/i.test(r));
        if (idx < 0) continue;
        const before = (await g.chatLines()).length;
        const r = await g.eval(
          `(()=>{const e=[...document.querySelectorAll('.menu-item')][${idx}].getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2}})()`,
        );
        await g.tap(r.x, r.y);
        await g.waitFor(async () => (await g.chatLines()).length > before, {
          label: 'examine chat line',
        });
        const line = (await g.chatLines()).at(-1);
        if (!re.test(line)) throw new Error(`${defId}: got "${line}", want ${re}`);
        if (defId !== 'tree' && defId !== 'oak_tree' && /tree/i.test(line) && !/oak/.test(defId))
          throw new Error(`${defId}: mentions tree: "${line}"`);
        return `${vp}: "${line}"`;
      }
      throw new Error(`${defId}: Examine row never reached`);
    });
  }
  await check('errors', '0 console errors', async () => {
    const e = g.consoleErrors();
    if (e.length) throw new Error(e.join(' | '));
    return `${vp}: 0`;
  });
});
