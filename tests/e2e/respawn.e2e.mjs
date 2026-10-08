// Respawn e2e: deplete a tree / copper rock / coal rock by real taps, then measure game ticks until it is available again.
// Fast base: runParallel splits by NODE KIND (tree | copper | coal, plain names -> one child each on PORT+i; the
// page itself is desktop), wait-on-state instead of wall-clock polling, budget 60 s.
// Respawn is counted in GAME TICKS, so it runs at two fast tick rates (150 and 60 ms) to show the count does not
// depend on tick length; ticks are recorded in-page by a store subscription (exact, not polled).
// Run: node tests/e2e/respawn.e2e.mjs
import { check, expect, runParallel, withGame } from './lib.mjs';

const PORT = 9157;
const BUDGET_MS = 60e3;
const PARTS = await runParallel(import.meta.url, PORT, {
  viewports: ['tree', 'copper', 'coal'], // parts, not screen sizes (plain: true -> bare names)
  plain: true,
  budgetMs: BUDGET_MS,
});
const J = JSON.stringify;
const nodeOf = (g, id) =>
  g.eval(`JSON.stringify(window.__e.game().gathering.nodes[${J(id)}] ?? null)`);
const texOf = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.nodes.get(${J(id)})?.art?.texture?.key ?? null`);
// In-page recorder: game tick at the moment node `id` appears in / disappears from gathering.nodes.
const watch = (g, id) =>
  g.eval(`(() => { window.__rw?.unsub?.(); const s = window.__idleRpg.store; const has = () => !!s.getState().game.gathering.nodes[${J(id)}];
    const w = (window.__rw = { gone: null, back: null, prev: has() });
    w.unsub = s.subscribe((n) => { const h = !!n.game.gathering.nodes[${J(id)}];
      if (h && !w.prev && w.gone === null) w.gone = n.game.tick; else if (!h && w.prev && w.gone !== null && w.back === null) w.back = n.game.tick;
      w.prev = h; }); return 0; })()`);
const rw = (g) => g.eval('({ gone: window.__rw.gone, back: window.__rw.back })');

async function runNode(g, tickMs, label, id, expectTicks, tapFn) {
  await check(
    label,
    `${label}: depletes then respawns in ~${expectTicks} ticks (tickMs ${tickMs})`,
    async () => {
      const before = await texOf(g, id);
      await watch(g, id);
      for (let attempt = 0; attempt < 6; attempt++) {
        await tapFn(attempt);
        const ok = await g
          .waitState('gathering.nodes', `n => !!n[${J(id)}]`, { timeoutMs: 12000 })
          .then(
            () => true,
            () => false,
          );
        if (ok) break;
      }
      expect((await nodeOf(g, id)) !== 'null', `${id} never depleted after 6 taps`);
      const n = JSON.parse(await nodeOf(g, id));
      const tex0 = await texOf(g, id);
      const waitMs = expectTicks * tickMs + 3000;
      const wall0 = Date.now();
      const back = await g
        .waitState('gathering.nodes', `n => !n[${J(id)}]`, { timeoutMs: waitMs + 20000 })
        .then(
          () => true,
          () => false,
        );
      const wall = Date.now() - wall0;
      const { gone: t0, back: t1 } = await rw(g);
      const nodeLine = `respawnAt ${n.respawnAt}, tick@deplete ${t0}, tick@back ${t1}, delta ${t1 - t0} (data ${expectTicks}), wall ${wall} ms`;
      expect(back, `NEVER respawned within ${waitMs + 20000} ms: ${nodeLine}`);
      // the view swaps art on the next frame(s): wait for it instead of a fixed 300 ms sleep
      const tex1 = await g
        .waitFor(
          async () => {
            const t = await texOf(g, id);
            return t !== tex0 || tex0 === before ? t : null;
          },
          { timeoutMs: 3000, label: 'art back' },
        )
        .catch(() => texOf(g, id));
      expect(
        tex1 !== tex0 || tex0 === before,
        `view art did not change back: depleted ${tex0}, after ${tex1}, before ${before}`,
      );
      return `${nodeLine}; art before ${before} / depleted ${tex0} / after ${tex1}`;
    },
  );
}

await withGame({ port: PORT, budgetMs: BUDGET_MS }, async (g) => {
  await g.setXp('mining', 200000);
  await g.setXp('woodcutting', 200000);
  const tree = await g.targetOfKind('tree');
  await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
  for (const tms of [150, 60]) {
    await g.setTickMs(tms);
    if (PARTS.includes('tree')) {
      await g.teleportSettled(tree.x, tree.y + 3);
      await runNode(g, tms, `r1@${tms}`, tree.id, 12, () => g.tapObject(tree.id));
    }
    for (const [label, id, x, y, ticks] of [
      ['copper', 'quarry_copper_1', 73, 41, 6],
      ['coal', 'quarry_coal_1', 70, 42, 14],
    ].filter(([label]) => PARTS.includes(label))) {
      await runNode(g, tms, `${label}@${tms}`, id, ticks, async (attempt) => {
        const dy = [2, 3, 1, 4, 2, 3][attempt];
        await g.teleportSettled(x, y + dy);
        const p = await g.tileClient(x, y, -12);
        await g.tap(p.x, p.y);
      });
    }
  }
});
