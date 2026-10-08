// Slice 6c: every fishingAttempt posts a chat line + plays fishCast (not on fishingStarted); parity with chopping.
import { check, expect, forEachViewport, waitStill, withGame } from './lib.mjs';

const SPY = `(() => {
  window.__snd = [];
  const P = window.AudioContext.prototype; if (P.__spied) return; P.__spied = true; const orig = P.createOscillator;
  P.createOscillator = function () {
    const o = orig.call(this); const f = o.frequency, sv = f.setValueAtTime.bind(f); let first = true;
    f.setValueAtTime = (v, t) => { if (first) { first = false; window.__snd.push({ at: performance.now(), wave: o.type, f: v }); } return sv(v, t); };
    return o;
  };
})();`;
const PORT = Number(process.env.E2E_PORT || 5248);
const ASYNC = (b) =>
  `(async () => { const R = await import('/src/app/registry.ts'); const S = window.__idleRpg.store; ${b} })()`;

await withGame(
  { port: PORT },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await g.load();
    const kit = ['small_fishing_net', 'fishing_rod', { itemId: 'fishing_bait', quantity: 50 }];
    const casts = async () =>
      (await g.eval('window.__snd')).filter((s) => s.wave === 'sine' && s.f >= 485 && s.f <= 550)
        .length;
    const lineCount = async (re) => (await g.chatLines()).filter((l) => re.test(l)).length;
    const fish = (id, attemptRe, level) =>
      g.realTime(async () => {
        await g.setInventory(kit);
        await g.setLevel('fishing', level);
        await g.update('({ ...g, chat: [] })');
        const t = await g.eval(
          ASYNC(
            `const sp = R.CONTENT.fishingSpots.get('${id}'); const i = S.getState().game.fishing.spots['${id}']?.tile ?? 0; return sp.tiles[i];`,
          ),
        );
        await g.teleport(t.x, t.y + 1);
        await g.eval('window.__snd.length = 0');
        const p = await waitStill(() => g.tileClient(t.x, t.y, 0));
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
        // Stop on a tick boundary-ish: removing the tool ends the session; then compare totals exactly.
        await g.setInventory([]);
        await g.sleep(900);
        return {
          lines: await g.chatLines(),
          snd: await casts(),
          ev: await g.eval('window.__ev'),
          sounds: await g.eval('window.__snd'),
        };
      });

    await check('c1', 'net: start line once, one "cast out your net" per attempt', async () => {
      const r = await fish('shore_net_1', /You cast out your net\./, 1);
      const start = r.lines.filter((l) => l === 'You cast out into the water.').length;
      const att = r.lines.filter((l) => l === 'You cast out your net.').length;
      expect(start === 1, `start lines ${start}: ${r.lines.slice(0, 6)}`);
      expect(att >= 3, `attempt lines ${att}`);

      globalThis.__dbg = {
        ev: r.ev,
        snd: r.sounds.map((x) => [x.wave, Math.round(x.f), Math.round(x.at)]),
      };
      return `${vp}: start ${start}, net lines ${att}`;
    });
    await check(
      'c2',
      'fishCast resolves once per attempt (+-150 ms of each attempt line), none at the start line',
      async () => {
        const { ev, snd } = globalThis.__dbg;
        const cand = snd.filter(([w, f]) => w === 'sine' && f >= 485 && f <= 550).map((x) => x[2]);
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
    await check(
      'c4',
      'chopping parity: start line + a swing line per swing (>=3 in real time)',
      async () => {
        const t = await g.targetOfKind('oak_tree');
        return g.realTime(async () => {
          await g.setLevel('woodcutting', 30);
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
            await g.teleport(t.x + dx, t.y + dy);
            try {
              await g.tapObject(t.id);
              ok = true;
              break;
            } catch {
              /* HUD cover */
            }
          }
          expect(ok, 'no tap offset');
          await g.waitFor(async () => (await g.eval('window.__sw')) >= 3, {
            timeoutMs: 40000,
            label: 'swing lines',
          });
          return `${vp}: swing lines ${await g.eval('window.__sw')} (1 start + per swing)`;
        });
      },
    );
  }),
);
