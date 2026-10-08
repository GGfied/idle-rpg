// Woodcutting sounds: axe hit per swing (impact), log crack/chime, tree fall, Sound off. Oscillator spy: audio
// has no DEV handle, so we classify the WebAudio oscillators the dispatcher creates (wave + start freq).
//   axeHit: triangle 105-230 (variant 2 = sine 240 + triangle 120; sine 215-260 alone is music) | logGained: sawtooth 450-600 + sine 880 | treeFall: sawtooth 190-250 + sine ~110
// FAST BASE: desktop + phone as parallel runParallel children (withCombos: one page load, spy as initScript), waits on
// state (ticks, chat lines, spy counts) instead of sleeps, budget 60 s. Run: node tests/e2e/axeSound.e2e.mjs (port 9581)
// t1 runs at real 600 ms ticks ON PURPOSE: the axe hit is timed to the impact of the chop animation, whose period is the
// fixed CHOP_SWING_PERIOD_MS (4 x 600 ms); its 1.9-2.9 s gap window only means something at real ticks. t2-t4 only
// count sounds, so they run at 60 ms ticks.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const SPY = `(() => {
  window.__snd = [];
  const P = window.AudioContext.prototype; if (P.__spied) return; P.__spied = true; const orig = P.createOscillator;
  P.createOscillator = function () {
    const o = orig.call(this); const f = o.frequency, sv = f.setValueAtTime.bind(f); let first = true;
    f.setValueAtTime = (v, t) => { if (first) { first = false; window.__snd.push({ at: performance.now(), wave: o.type, f: v }); } return sv(v, t); };
    return o;
  };
})();`;
const classify = (s) =>
  s.wave === 'sawtooth' && s.f >= 450 && s.f <= 600
    ? 'crack'
    : s.wave === 'sawtooth' && s.f >= 190 && s.f <= 250
      ? 'fall'
      : s.wave === 'triangle' && s.f >= 105 && s.f <= 230
        ? 'hit'
        : null;
const snd = async (g) => (await g.eval('window.__snd')).map((s) => ({ ...s, k: classify(s) }));
const count = async (g, k) => (await snd(g)).filter((s) => s.k === k);
const logCount = (g) =>
  g.eval(
    `window.__idleRpg.store.getState().game.inventory.slots.reduce((n, s) => n + (s && /logs/.test(s.itemId) ? s.quantity : 0), 0)`,
  );

const PORT = 9581;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS, initScripts: [SPY] }, COMBOS, async (g, vp) => {
  let swing = { hits: 0, lines: 0 };
  /** Wait until the game tick has advanced n ticks (observation window in ticks, not a fixed sleep). */
  const ticks = async (n) => {
    const t0 = await g.state('tick');
    await g.waitState('tick', `t => t >= ${t0 + n}`, {
      timeoutMs: n * 600 * 2 + 3000,
      label: `${n} ticks`,
    });
  };
  const chop = async (kind) => {
    const t = await g.targetOfKind(kind);
    await g.setLevel('woodcutting', 30);
    await g.setInventory(['bronze_axe']);
    let ok = false;
    const miss = [];
    for (const [dx, dy] of [
      [2, 2],
      [1, 2],
      [2, 1],
      [1, 1],
      [0, 2],
      [2, 0],
      [-1, 2],
      [2, -1],
      [0, 3],
      [-2, 2],
    ]) {
      await g.teleportSettled(t.x + dx, t.y + dy);
      await g.eval('window.__snd.length = 0');
      try {
        await g.tapObject(t.id);
      } catch {
        continue; // covered by HUD: next offset
      }
      // the tap must have reached the tree (walk/chop started); else note why and try the next offset
      ok = await g
        .waitState(
          '',
          `s => s.gathering.session?.nodeId === ${JSON.stringify(t.id)} || s.pendingInteraction != null`,
          { timeoutMs: 3000, label: 'chop started' },
        )
        .then(
          () => true,
          async () => {
            const st = await g.state();
            miss.push(
              `${dx},${dy}: pos ${JSON.stringify(st.movement.position)} path ${st.movement.path.length} chat ${JSON.stringify(st.chat.slice(-2).map((l) => l.text))}`,
            );
            return false;
          },
        );
      if (ok) break;
    }
    expect(ok, `no tap offset started chopping ${t.id}: ${miss.join(' | ')}`);
    return t;
  };

  await g.realTime(async () => {
    await check('t1', 'axe hit once per swing, at the impact (oak, ~5 swings)', async () => {
      const t0 = Date.now();
      const base = await g.chatCount('swing your axe');
      await chop('oak_tree');
      await g.waitFor(async () => (await count(g, 'hit')).length >= 5, {
        timeoutMs: 40000,
        label: '5 hits',
      });
      // one more swing period (4 ticks = 2.4 s) of observation, as the old fixed 2.5 s, to catch extra hits
      await ticks(4);
      const el = Date.now() - t0;
      const hits = await count(g, 'hit');
      const gaps = hits.slice(1).map((h, i) => Math.round(h.at - hits[i].at));
      const regular = gaps.filter((x) => x >= 1500);
      const extras = gaps.length - regular.length;
      const started = (await g.chatCount('swing your axe')) - base;
      swing = { hits: hits.length, lines: started };
      expect(
        hits.length >= 5 && regular.length === hits.length - 1,
        `hits ${hits.length}, gaps ${gaps}`,
      );
      expect(
        regular.length >= 3 && regular.every((x) => x >= 1900 && x <= 2900),
        `regular gaps ${gaps}`,
      );
      expect(
        extras === 0,
        `${extras} extra hits (<1.5 s after a hit; stopgap gatherStarted/itemGathered): gaps ${gaps}`,
      );
      return `${vp}: hits ${hits.length} in ${el} ms (~${(el / 2400).toFixed(1)} swings), gaps ${gaps}, 'swing your axe' chat lines ${started}`;
    });
    // Only t1 measures real swing timing (4 ticks = 2.4 s). The rest only counts sounds, so it runs on fast ticks.
    await g.setTickMs(60);
    await check('t2', 'each log plays one crack (+chime)', async () => {
      const inv = await logCount(g);
      await g.waitFor(async () => (await logCount(g)) >= 1, { timeoutMs: 40000, label: '1 log' });
      // the crack of that log, then 2 ticks for a (wrong) extra crack (was a fixed 500 ms)
      await g
        .waitFor(async () => (await count(g, 'crack')).length >= 1, {
          timeoutMs: 3000,
          label: 'crack',
        })
        .catch(() => {});
      await ticks(2);
      const n = await logCount(g);
      const cracks = (await count(g, 'crack')).length;
      expect(cracks === n, `logs ${n} (was ${inv} at start) vs cracks ${cracks}`);
      return `${vp}: logs ${n}, crack sounds ${cracks}`;
    });
    await check('t3', 'tree falls -> treeFall plays once', async () => {
      const t = await chop('tree');
      await g.waitFor(async () => (await count(g, 'fall')).length >= 1, {
        timeoutMs: 40000,
        label: 'fall sound',
      });
      await ticks(5); // a duplicate fall sound would land within a few ticks (was a fixed 800 ms)
      const falls = (await count(g, 'fall')).length;
      const node = await g.state(`gathering.nodes[${JSON.stringify(t.id)}]`);
      expect(falls === 1, `falls ${falls}`);
      return `${vp}: fall sounds ${falls}, node ${JSON.stringify(node)}`;
    });
    await check('t4', 'Sound off -> nothing plays while chopping', async () => {
      await g.eval('window.__idleRpg.store.getState().toggleMute()');
      try {
        expect(await g.eval('window.__idleRpg.store.getState().sound.muted'), 'not muted');
        await g.update('({ ...g, chat: [] })'); // a capped chat would hide new lines
        // swings = attempts: a missed swing posts 'You swing your axe', a successful one the log line instead
        const attempts = async () =>
          (await g.chatLines()).filter((l) => /swing your axe|You get some oak logs/.test(l))
            .length;
        const t = await chop('oak_tree');
        // keep-alive: an oak can fall after a log; tap it again once it is back (the swings are what matter)
        const stop = g.every(400, async () => {
          const st = await g.state();
          if (st.gathering.session || st.pendingInteraction || st.movement.path.length) return;
          if (st.gathering.nodes[t.id]) return; // stump: wait for the respawn
          await g.tapObject(t.id);
        });
        try {
          // chop on (Sound off) until 3 swings were made: proves chopping really ran (was a fixed 7 s / 2.5 s)
          await g.waitFor(async () => (await attempts()) >= 3, {
            timeoutMs: 20000,
            label: '3 swings while muted',
          });
          await ticks(2);
        } finally {
          stop();
        }
        const n = (await snd(g)).length;
        const swings = await attempts();
        expect(n === 0, `${n} oscillators while muted`);
        return `${vp}: oscillators 0 over ${swings} swings of chopping with Sound off`;
      } finally {
        await g.eval(
          'window.__idleRpg.store.getState().sound.muted && window.__idleRpg.store.getState().toggleMute()',
        );
      }
    });
  });
  await check(
    't5',
    'every swing posts a chat line (user rule): lines == axe hits (+-1), >= 4',
    async () => {
      const { hits, lines } = swing;
      expect(lines >= 4, `only ${lines} 'You swing your axe' lines for ${hits} swings`);
      expect(Math.abs(lines - hits) <= 1, `${lines} swing lines vs ${hits} axe hits`);
      return `${vp}: ${lines} swing chat lines vs ${hits} axe-hit sounds`;
    },
  );
});
