// Slice 6c: every fishingAttempt posts a chat line + plays fishCast (not on fishingStarted); parity with chopping.
// FAST BASE: desktop + phone as parallel runParallel children (withCombos: one page load, sound spy as initScript),
// waits on state instead of sleeps, budget 60 s. Run: node tests/e2e/fishChat.e2e.mjs (base port 9571)
// Tick 150 ms, not the 60 ms default and not real time (600 ms): an attempt is 4 ticks, and c2 matches each fishCast
// to its attempt line within +-150 ms while the sound has a 300 ms minGap, so attempts must stay >= ~600 ms apart
// (4 x 150 ms). At 60 ms they would be 240 ms apart (inside the minGap). Line/sound COUNTS do not depend on tick length.
// fishCast = a sine starting 485-550 Hz that glides DOWN (its 520 -> 220 plop); spotBurble (a spot shifting, any spot)
// has a 500 Hz sine that glides UP and used to be miscounted as a cast whenever a spot moved during an attempt.
const isCast = (s) =>
  s.wave === 'sine' && s.f >= 485 && s.f <= 550 && s.to !== undefined && s.to < s.f;
import { check, expect, runParallel, withCombos } from './lib.mjs';

const SPY = `(() => {
  window.__snd = [];
  const P = window.AudioContext.prototype; if (P.__spied) return; P.__spied = true; const orig = P.createOscillator;
  P.createOscillator = function () {
    const o = orig.call(this); const f = o.frequency, sv = f.setValueAtTime.bind(f); let first = true;
    let entry = null; const er = f.exponentialRampToValueAtTime.bind(f);
    f.setValueAtTime = (v, t) => { if (first) { first = false; entry = { at: performance.now(), wave: o.type, f: v }; window.__snd.push(entry); } return sv(v, t); };
    // record the glide target too: fishCast's plop FALLS (520 -> 220) while spotBurble's 500 Hz layer RISES (-> 1000)
    f.exponentialRampToValueAtTime = (v, t) => { if (entry && entry.to === undefined) entry.to = v; return er(v, t); };
    return o;
  };
})();`;
const PORT = 9571;
const BUDGET_MS = 60e3;
const TICK_MS = 150;
const ASYNC = (b) =>
  `(async () => { const R = await import('/src/app/registry.ts'); const S = window.__idleRpg.store; ${b} })()`;

const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
await withCombos(
  { port: PORT, budgetMs: BUDGET_MS, tickMs: TICK_MS, initScripts: [SPY] },
  COMBOS,
  async (g, vp) => {
    const kit = ['small_fishing_net', 'fishing_rod', { itemId: 'fishing_bait', quantity: 50 }];
    const casts = async () => (await g.eval('window.__snd')).filter(isCast).length;
    const lineCount = async (re) => (await g.chatLines()).filter((l) => re.test(l)).length;
    const fish = (id, attemptRe, level) =>
      (async () => {
        await g.setInventory(kit);
        await g.setLevel('fishing', level);
        await g.update('({ ...g, chat: [] })');
        const t = await g.eval(
          ASYNC(
            `const sp = R.CONTENT.fishingSpots.get('${id}'); const i = S.getState().game.fishing.spots['${id}']?.tile ?? 0; return sp.tiles[i];`,
          ),
        );
        await g.teleport(t.x, t.y + 1, { settleMs: 0 });
        await g.eval('window.__snd.length = 0');
        await g.settle();
        const p = await g.tileClient(t.x, t.y, 0);
        expect(
          await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`),
          `spot covered at ${p.x},${p.y}`,
        );
        await g.eval(`(() => { window.__ev = []; const t0 = performance.now(); let n = 0, tile = JSON.stringify(window.__idleRpg.store.getState().game.fishing.spots);
          window.__idleRpg.store.subscribe((st) => { const f = st.game.fishing; const sp = JSON.stringify(f.spots); const c = st.game.chat.filter((l) => /cast/.test(JSON.stringify(l))).length;
            if (c !== n) { window.__ev.push(['chat', Math.round(performance.now()), c]); n = c; }
            if (sp !== tile) { window.__ev.push(['spot', Math.round(performance.now())]); tile = sp; } }); })()`);
        await g.tap(p.x, p.y);
        await g.waitFor(async () => (await lineCount(attemptRe)) >= 3, {
          timeoutMs: 60000,
          label: 'attempt lines',
        });
        // Removing the tool ends the session; wait for that (was a fixed 900 ms), then compare totals exactly.
        await g.setInventory([]);
        await g.waitState('fishing.session', 's => s == null', { label: 'fishing session ended' });
        await g.waitTicks(1);
        return {
          lines: await g.chatLines(),
          snd: await casts(),
          ev: await g.eval('window.__ev'),
          sounds: await g.eval('window.__snd'),
        };
      })();

    await check('c1', 'net: start line once, one "cast out your net" per attempt', async () => {
      const r = await fish('shore_net_1', /You cast out your net\./, 1);
      const start = r.lines.filter((l) => l === 'You cast out into the water.').length;
      const att = r.lines.filter((l) => l === 'You cast out your net.').length;
      expect(start === 1, `start lines ${start}: ${r.lines.slice(0, 6)}`);
      expect(att >= 3, `attempt lines ${att}`);

      globalThis.__dbg = {
        ev: r.ev,
        snd: r.sounds.map((x) => [x.wave, Math.round(x.f), Math.round(x.at), isCast(x)]),
      };
      return `${vp}: start ${start}, net lines ${att}`;
    });
    await check(
      'c2',
      'fishCast resolves once per attempt (+-150 ms of each attempt line), none at the start line',
      async () => {
        const { ev, snd } = globalThis.__dbg;
        const cand = snd.filter((x) => x[3]).map((x) => x[2]);
        const at = (t) => cand.filter((c) => Math.abs(c - t) <= 150).length;
        const lines = ev.filter((e) => e[0] === 'chat').map((e) => e[1]);
        const [start, ...attempts] = lines;
        expect(attempts.length >= 3, `attempts ${attempts.length}`);
        expect(at(start) === 0, `fishCast near start line (${start}): ${JSON.stringify(cand)}`);
        const per = attempts.map(at);
        expect(
          per.every((n) => n === 1),
          `per-attempt casts ${per} (cand ${cand}, lines ${lines})`,
        );
        return `${vp}: start casts 0, per-attempt ${per}`;
      },
    );
    await check('c3', 'bait L5: "You cast your line." per attempt, sound matches', async () => {
      const r = await fish('shore_bait_1', /You cast your line\./, 5);
      const start = r.lines.filter((l) => l === 'You cast out into the water.').length;
      const att = r.lines.filter((l) => l === 'You cast your line.').length;
      expect(start === 1 && att >= 3, `start ${start} att ${att}`);
      expect(r.snd === att, `fishCast ${r.snd} vs attempts ${att}`);
      return `${vp}: start ${start}, line ${att}, fishCast ${r.snd}`;
    });
    await check('c4', 'chopping parity: start line + a swing line per swing (>=3)', async () => {
      const t = await g.targetOfKind('oak_tree');
      return (async () => {
        // level 15 (the oak minimum): low success, so most swings fail and post their swing line (a successful swing
        // posts the log line instead, and an oak falls after 1/8 of logs: at 30 the session sometimes ended at 2 swings)
        await g.setLevel('woodcutting', 15);
        await g.setInventory(['bronze_axe']);
        await g.update('({ ...g, chat: [] })');
        await g.eval(
          `(() => { window.__sw = 0; let seen = 0; window.__idleRpg.store.subscribe((st) => { const c = st.game.chat.length; const l = st.game.chat[c - 1]; if (c !== seen) { seen = c; if (/swing your axe/.test(JSON.stringify(l))) window.__sw++; } }); })()`,
        );
        let ok = false;
        for (const [dx, dy] of [
          [2, 2],
          [1, 2],
          [2, 1],
          [1, 1],
          [0, 2],
          [2, 0],
          [-1, 2],
          [0, 3],
        ]) {
          await g.teleportSettled(t.x + dx, t.y + dy);
          try {
            await g.tapObject(t.id);
            ok = true;
            break;
          } catch {
            /* HUD cover */
          }
        }
        expect(ok, 'no tap offset');
        // keep-alive: if the oak fell before 3 swings, tap it again once it is back (the swing count is what is tested)
        let retaps = 0;
        const stop = g.every(400, async () => {
          const st = await g.state();
          if (st.gathering.session || st.pendingInteraction || st.movement.path.length) return;
          if (st.gathering.nodes[t.id]) return; // stump: wait for the respawn
          await g.tapObject(t.id);
          retaps++;
        });
        await g
          .waitFor(async () => (await g.eval('window.__sw')) >= 3, {
            timeoutMs: 20000,
            label: 'swing lines',
          })
          .catch(async (e) => {
            stop();
            const st = await g.state();
            throw new Error(
              `${e.message}; retaps ${retaps}; sw ${await g.eval('window.__sw')} pos ${JSON.stringify(st.movement.position)} path ${st.movement.path.length} pending ${JSON.stringify(st.pendingInteraction)} session ${JSON.stringify(st.gathering.session)} chat ${JSON.stringify(st.chat.slice(-4).map((l) => l.text))}`,
            );
          });
        stop();
        return `${vp}: swing lines ${await g.eval('window.__sw')} (1 start + per swing; keep-alive re-taps ${retaps})`;
      })();
    });
  },
);
