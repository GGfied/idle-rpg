// Oak tuning e2e: oak xp 45, normal tree xp 25, oak success band for successLow/High 48/150. Own vite on :5233.
// Run: node tests/e2e/oakTuning.e2e.mjs   (E2E_PORT overrides the port for mutation copies)
import { check, forEachViewport, withGame } from './lib.mjs';
import process from 'node:process';

process.env.SHOTS_DIR ??= new URL('./.shots-oak', import.meta.url).pathname;

const LEVEL = 40; // p = (1 + floor(48*59/98 + 150*39/98 + .5)) / 256 = 90/256 = 0.352
const P = 90 / 256;
const N_ATTEMPTS = 150;

const hook = `(() => {
  const s = window.__idleRpg.store;
  window.__o = { deltas: [], attempts: 0, lastTick: -1, last: s.getState().game.progression.xp.woodcutting };
  window.__ounsub = s.subscribe((n) => {
    const g = n.game, o = window.__o;
    const xp = g.progression.xp.woodcutting;
    if (xp !== o.last) { o.deltas.push(xp - o.last); o.last = xp; }
    if (g.tick !== o.lastTick) {
      o.lastTick = g.tick;
      if (g.gathering.session && g.gathering.session.cooldown === 1) o.attempts++;
    }
  });
})()`;
const stats = (g) => g.eval('({ ...window.__o })');

await withGame(
  { port: 5233 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const chopOnce = async (kind) => {
      await g.setInventory(['bronze_axe']);
      const t = await g.targetOfKind(kind);
      await g.setLevel('woodcutting', LEVEL);
      await g.teleport(t.x, t.y + 3);
      await g.eval(hook);
      const start = await g.state('movement.position');
      await g.tapObject(t.id);
      await g.waitFor(async () => (await stats(g)).deltas.length > 0, {
        timeoutMs: 40000,
        label: `${kind} xp`,
      });
      const end = await g.state('movement.position');
      const o = await stats(g);
      await g.screenshot(`oak-${vp}-${kind}`);
      await g.eval('window.__ounsub()');
      return { t, start, end, o };
    };

    await check('t1', 'tap an oak: player walks there and chops', async () => {
      const { t, start, end } = await chopOnce('oak_tree');
      g.expect(start.x !== end.x || start.y !== end.y, 'player did not move');
      return `${vp}: ${JSON.stringify(start)} -> ${JSON.stringify(end)} (oak ${t.x},${t.y})`;
    });
    await check('t2', 'each oak log grants exactly 45 Woodcutting XP', async () => {
      const { o } = await chopOnce('oak_tree');
      g.expect(
        o.deltas.every((d) => d === 45),
        `deltas ${JSON.stringify(o.deltas)}`,
      );
      return `${vp}: deltas ${JSON.stringify(o.deltas)}`;
    });
    await check('t3', 'normal tree still grants 25 XP', async () => {
      const { o } = await chopOnce('tree');
      g.expect(
        o.deltas.every((d) => d === 25),
        `deltas ${JSON.stringify(o.deltas)}`,
      );
      return `${vp}: deltas ${JSON.stringify(o.deltas)}`;
    });
    await check('t4', `oak logs per attempt in band over ${N_ATTEMPTS} attempts`, async () => {
      const oaks = (await g.targets()).filter((x) => x.kind === 'oak_tree');
      await g.setLevel('woodcutting', LEVEL);
      await g.eval(hook);
      let i = 0;
      const t0 = Date.now();
      while ((await stats(g)).attempts < N_ATTEMPTS) {
        g.expect(Date.now() - t0 < 150000, 'timeout collecting attempts');
        const sess = await g.state('gathering.session');
        if (!sess) {
          await g.setInventory(['bronze_axe']);
          const t = oaks[i++ % oaks.length];
          await g.teleport(t.x, t.y + 3, { settleMs: 400 });
          await g.tapObject(t.id);
        }
        await g.sleep(150);
      }
      const o = await stats(g);
      await g.eval('window.__ounsub()');
      const logs = o.deltas.length;
      const rate = logs / o.attempts;
      const sd = Math.sqrt((P * (1 - P)) / o.attempts);
      g.expect(
        o.deltas.every((d) => d === 45),
        'non-45 delta',
      );
      g.expect(
        Math.abs(rate - P) < 4 * sd,
        `rate ${rate.toFixed(3)} vs ${P.toFixed(3)} +-${(4 * sd).toFixed(3)}`,
      );
      return `${vp}: ${logs} logs / ${o.attempts} attempts = ${rate.toFixed(3)} (expected ${P.toFixed(3)}, 4sd ${(4 * sd).toFixed(3)}; unseeded run, 4-sigma band)`;
    });
    await check('t5', 'no console errors', async () => {
      const e = g.consoleErrors();
      g.expect(e.length === 0, e.join(' | '));
      return `${vp}: 0 errors`;
    });
  }),
);
