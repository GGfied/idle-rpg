// Woodcutting sounds: axe hit per swing (impact), log crack/chime, tree fall, Sound off. Oscillator spy: audio
// has no DEV handle, so we classify the WebAudio oscillators the dispatcher creates (wave + start freq).
//   axeHit: triangle 105-230 (variant 2 = sine 240 + triangle 120; sine 215-260 alone is music) | logGained: sawtooth 450-600 + sine 880 | treeFall: sawtooth 190-250 + sine ~110
import { check, expect, forEachViewport, withGame } from './lib.mjs';

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

const PORT = Number(process.env.E2E_PORT || 5204);
await withGame(
  { port: PORT },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    let swing = { hits: 0, lines: 0 };
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await g.load();
    const chop = async (kind) => {
      const t = await g.targetOfKind(kind);
      await g.setLevel('woodcutting', 30);
      await g.setInventory(['bronze_axe']);
      let ok = false;
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
        await g.teleport(t.x + dx, t.y + dy);
        await g.eval('window.__snd.length = 0');
        try {
          await g.tapObject(t.id);
          ok = true;
          break;
        } catch {
          /* covered by HUD: next offset */
        }
      }
      expect(ok, `no free tap offset for ${t.id}`);
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
        await g.sleep(2500);
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
      await check('t2', 'each log plays one crack (+chime)', async () => {
        const inv = await logCount(g);
        await g.waitFor(async () => (await logCount(g)) >= 1, { timeoutMs: 40000, label: '1 log' });
        await g.sleep(500);
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
        await g.sleep(800);
        const falls = (await count(g, 'fall')).length;
        const node = await g.state(`gathering.nodes[${JSON.stringify(t.id)}]`);
        expect(falls === 1, `falls ${falls}`);
        return `${vp}: fall sounds ${falls}, node ${JSON.stringify(node)}`;
      });
      await check('t4', 'Sound off -> nothing plays while chopping', async () => {
        await g.eval('window.__idleRpg.store.getState().toggleMute()');
        try {
          expect(await g.eval('window.__idleRpg.store.getState().sound.muted'), 'not muted');
          await g.chatCount('swing your axe');
          await chop('oak_tree');
          await g.sleep(7000);
          const n = (await snd(g)).length;
          const lines = (await g.chatLines()).length;
          expect(n === 0, `${n} oscillators while muted`);
          return `${vp}: oscillators 0 over 7 s of chopping (chat lines ${lines})`;
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
  }),
);
