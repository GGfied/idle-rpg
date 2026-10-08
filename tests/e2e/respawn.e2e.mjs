// Respawn e2e: deplete a tree / copper rock / coal rock by real taps, then measure game ticks until it is available again.
// Run: TICK_MS=600 node tests/e2e/respawn.e2e.mjs   (port 5278, E2E_PORT overrides); TICK_MS=60 for fast ticks.
import { check, expect, withGame } from './lib.mjs';

let TICK_MS = 600;
const port = Number(process.env.E2E_PORT ?? 5278);
const J = JSON.stringify;
const nodeOf = (g, id) =>
  g.eval(`JSON.stringify(window.__e.game().gathering.nodes[${J(id)}] ?? null)`);
const tickOf = (g) => g.eval('window.__e.game().tick');
const texOf = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.nodes.get(${J(id)})?.art?.texture?.key ?? null`);

async function runNode(g, label, id, expectTicks, tapFn) {
  await check(
    label,
    `${label}: depletes then respawns in ~${expectTicks} ticks (tickMs ${TICK_MS})`,
    async () => {
      const before = await texOf(g, id);
      for (let attempt = 0; attempt < 6; attempt++) {
        await tapFn(attempt);
        const t = Date.now();
        while (Date.now() - t < 12000 && (await nodeOf(g, id)) === 'null') await g.sleep(100);
        if ((await nodeOf(g, id)) !== 'null') break;
      }
      expect((await nodeOf(g, id)) !== 'null', `${id} never depleted after 6 taps`);
      const n = JSON.parse(await nodeOf(g, id));
      const t0 = await tickOf(g);
      const tex0 = await texOf(g, id);
      const wall0 = Date.now();
      const waitMs = expectTicks * TICK_MS + 3000;
      await g.sleep(Math.min(waitMs, 600));
      let t1 = t0;
      let back = false;
      while (Date.now() - wall0 < waitMs + 20000) {
        if ((await nodeOf(g, id)) === 'null') {
          back = true;
          t1 = await tickOf(g);
          break;
        }
        await g.sleep(Math.max(20, TICK_MS / 3));
      }
      const wall = Date.now() - wall0;
      await g.sleep(300);
      const tex1 = await texOf(g, id);
      const nodeLine = `respawnAt ${n.respawnAt}, tick@deplete ${t0}, tick@back ${t1}, delta ${t1 - t0} (data ${expectTicks}), wall ${wall} ms`;
      expect(back, `NEVER respawned within ${waitMs + 20000} ms: ${nodeLine}`);
      expect(
        tex1 !== tex0 || tex0 === before,
        `view art did not change back: depleted ${tex0}, after ${tex1}, before ${before}`,
      );
      return `${nodeLine}; art before ${before} / depleted ${tex0} / after ${tex1}`;
    },
  );
}

await withGame({ port, tickMs: 600 }, async (g) => {
  await g.update(
    `({ ...g, progression: { ...g.progression, xp: { ...g.progression.xp, mining: 200000, woodcutting: 200000 } } })`,
  );
  const tree = await g.targetOfKind('tree');
  await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
  for (const tms of [600, 60]) {
    await g.eval(`window.__idleRpg.setTickMs(${tms})`);
    TICK_MS = tms;
    await g.teleport(tree.x, tree.y + 3);
    await runNode(g, `r1@${tms}`, tree.id, 12, () => g.tapObject(tree.id));
    for (const [label, id, x, y, ticks] of [
      ['copper', 'quarry_copper_1', 73, 41, 6],
      ['coal', 'quarry_coal_1', 70, 42, 14],
    ]) {
      await runNode(g, `${label}@${tms}`, id, ticks, async (attempt) => {
        const dy = [2, 3, 1, 4, 2, 3][attempt];
        await g.teleport(x, y + dy);
        const p = await g.tileClient(x, y, -12);
        await g.tap(p.x, p.y);
      });
    }
  }
  await check('r9', 'no console errors', async () => {
    expect(g.errors.length === 0, g.errors.join('|'));
    return '0 errors';
  });
});
