// Level-up e2e: real chop -> level-up popup/chat/effects/skills/tracker, Notifications + Effects toggles.
// Run: node tests/e2e/levelUp.e2e.mjs   (base port E2E_PORT or 9053; desktop + phone run as parallel children)
// Fast base: ?tickMs=60, waits on state. realTime is NOT used: the popup's ~4 s lifetime (L8/L9) is a HUD wall-clock
// timer, independent of the game tick, so those two checks wait on the DOM against wall-clock bounds by design.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT ?? 9053);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const world = () => H().scene().camera.scene;
  const live = (o) => o.visible && o.active && o.alpha > 0;
  window.__t = {
    xp: () => H().store.getState().game.progression.xp.woodcutting,
    lvl: async () => { const P = await import('/src/core/progression/index.ts'); return P.levelForXp(H().store.getState().game.progression.xp.woodcutting); },
    logs: async () => { const I = await import('/src/core/inventory/index.ts'); return I.countItem(H().store.getState().game.inventory, 'logs'); },
    // set Woodcutting xp to (xp needed for level L) - 1 so one log crosses into L
    justBelow: async (L) => { const P = await import('/src/core/progression/index.ts'); const s = H().store, g = s.getState().game;
      s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, woodcutting: P.xpForLevel(L) - 1 } } } }); },
    chop: async () => { const { CONTENT } = await import('/src/app/registry.ts'); const s = H().store; const me = s.getState().game.movement.position; let best = null;
      for (const [id, t] of CONTENT.trees) { const d = Math.abs(t.x - me.x) + Math.abs(t.y - me.y); if (best === null || d < best.d) best = { id, d }; }
      s.getState().interactTree(best.id); return best; },
    // sampler: max count of live gold (level-up ring/sparkle) arcs seen since reset
    gold: () => world().children.list.filter((o) => o.type === 'Arc' && o.fillColor === 0xffe14d && live(o)).length,
    startSampler: () => { window.__max = 0; clearInterval(window.__iv); window.__iv = setInterval(() => { window.__max = Math.max(window.__max, window.__t.gold()); }, 8); },
    max: () => window.__max,
    frames: (n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r(0)); requestAnimationFrame(f); }),
    popup: () => { const e = document.querySelector('.levelup'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, html: e.innerHTML, l: r.left, r: r.right, t: r.top, b: r.bottom }; },
    popups: () => document.querySelectorAll('.levelup').length,
    chatDom: () => document.querySelector('[role=log]')?.textContent ?? '',
    playerClient: () => { const c = H().scene().playerView.container; return window.__e.toClient(c.x, c.y); },
    pos: () => { const p = H().store.getState().game.movement.position; return p.x + ',' + p.y; },
    switchState: (label) => { const e = [...document.querySelectorAll('[role=switch]')].find((x) => x.textContent.trim().startsWith(label)); return e ? e.getAttribute('aria-checked') : null; },
    // tag the first element of sel whose text equals / starts with text, so g.tapSelector can find it
    tag: (sel, text, starts) => { document.querySelectorAll('[data-e2e-tag]').forEach((x) => x.removeAttribute('data-e2e-tag'));
      const e = [...document.querySelectorAll(sel)].find((x) => starts ? x.textContent.trim().startsWith(text) : x.textContent.trim() === text); if (!e) return false; e.setAttribute('data-e2e-tag', '1'); return true; },
  };
})();`;

const NAME = 'Woodcutting';
const LINE = (n) =>
  `Congratulations, you've just advanced your ${NAME} level. You are now level ${n}.`;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g) => {
    await g.eval(PAGE);
    const T = (e) => g.eval(`window.__t.${e}`);
    const tapText = async (sel, text, starts = false) => {
      expect(
        await T(`tag(${JSON.stringify(sel)}, ${JSON.stringify(text)}, ${starts})`),
        `not found: ${sel} ${text}`,
      );
      return g.tapSelector('[data-e2e-tag]');
    };
    // chop (re-interacting while trees deplete/respawn) until woodcutting xp rises; wait on state, no sleeps
    const chopOne = async () => {
      const xp0 = await T('xp()');
      const logs0 = await T('logs()');
      let i = 0;
      await g.waitFor(
        async () => {
          if (i++ % 25 === 0) await T('chop()');
          return (await T('xp()')) > xp0;
        },
        { timeoutMs: 15000, label: 'xp from chopping' },
      );
      return { xp0, logs0 };
    };
    // negative checks (no popup / no fx) need a window for the effect to have appeared: 2 ticks + 20 frames
    const window_ = async () => {
      await g.waitTicks(2);
      await T('frames(20)');
    };

    await check(
      'L0',
      'control: chop with no level boundary = log + no popup + no gold fx',
      async () => {
        await T('startSampler()');
        const lvl0 = await T('lvl()');
        const { logs0 } = await chopOne();
        await g.waitFor(async () => (await T('logs()')) === logs0 + 1, { label: 'log gained' });
        await window_();
        const logs1 = await T('logs()');
        expect(logs1 === logs0 + 1, `logs ${logs0}->${logs1}`);
        expect((await T('lvl()')) === lvl0, 'level changed');
        expect((await T('popups()')) === 0, 'popup without level-up');
        expect((await T('max()')) === 0, 'gold fx without level-up');
        return `lvl ${lvl0}, logs ${logs0}->${logs1}, popups 0, gold max 0`;
      },
    );

    let gold1 = 0;
    await check(
      'L1',
      'real chop across a boundary: level 1->2 (xp 82 -> >=83), log gained',
      async () => {
        await T('justBelow(2)');
        await T('startSampler()');
        const { xp0, logs0 } = await chopOne();
        await g.waitFor(async () => (await T('logs()')) === logs0 + 1, { label: 'log gained' });
        await T('frames(20)'); // let the level-up ring/sparkles spawn for the sampler
        const lvl = await T('lvl()');
        const logs1 = await T('logs()');
        gold1 = await T('max()');
        expect(lvl === 2, `level ${lvl}`);
        expect(logs1 === logs0 + 1, `logs ${logs0}->${logs1}`);
        return `xp ${xp0}->${await T('xp()')}, level 2, logs ${logs0}->${logs1}`;
      },
    );

    await check('L1b', 'tracker (HUD) shows Woodcutting Lv 2 right after the chop', async () => {
      const tr = await g.eval(
        `document.querySelector('[aria-label="Woodcutting tracker"]')?.textContent ?? null`,
      );
      expect(tr && tr.includes('Lv 2'), 'tracker ' + tr);
      return `tracker "${tr}"`;
    });

    await check(
      'L2',
      'popup shows skill name + new level, plain text (no markup in text)',
      async () => {
        const p = await g.waitFor(() => T('popup()'), { timeoutMs: 3000, label: 'popup' });
        expect(p.text.includes('Congratulations!'), p.text);
        expect(p.text.includes('Your Woodcutting level is now 2.'), p.text);
        expect(!/<script|&lt;/i.test(p.html), 'html leak');
        const vw = await g.eval('innerWidth');
        expect(p.l >= 0 && p.r <= vw && p.t >= 0, `popup off-screen ${JSON.stringify(p)}`);
        return `"${p.text}" rect ${Math.round(p.l)}-${Math.round(p.r)} x ${Math.round(p.t)}-${Math.round(p.b)} vw ${vw}`;
      },
    );

    await check(
      'L3',
      'popup does not block play: tap ground away from it, player walks',
      async () => {
        const p = await T('popup()');
        expect(p, 'popup gone already');
        const pc = await T('playerClient()');
        const start = await T('pos()');
        const vw = await g.eval('innerWidth');
        const vh = await g.eval('innerHeight');
        let moved = null;
        for (const [dx, dy] of [
          [70, 40],
          [-70, 40],
          [70, -40],
          [-70, -40],
          [0, 90],
          [0, -90],
        ]) {
          const x = pc.x + dx,
            y = pc.y + dy;
          if (x > p.l - 8 && x < p.r + 8 && y > p.t - 8 && y < p.b + 8) continue;
          if (x < 5 || y < 5 || x > vw - 5 || y > vh - 5) continue;
          if (!(await g.page(`topIsCanvas(${x}, ${y})`))) continue;
          await g.tap(x, y);
          const to = await g
            .waitFor(
              async () => {
                const q = await T('pos()');
                return q !== start && q;
              },
              { timeoutMs: 1500, label: 'player moved' },
            )
            .catch(() => null);
          if (to) {
            moved = { dx, dy, from: start, to };
            break;
          }
        }
        expect(moved, 'player never moved while popup visible');
        return `moved ${moved.from} -> ${moved.to} (tap offset ${moved.dx},${moved.dy}) popup still: ${!!(await T('popup()'))}`;
      },
    );

    await check('L4', 'chat gets the level-up line (store + DOM)', async () => {
      const chat = await g.chatLines();
      expect(chat.includes(LINE(2)), 'store chat lacks line: ' + JSON.stringify(chat.slice(-3)));
      const dom = await T('chatDom()');
      expect(dom.includes(LINE(2)), 'chat DOM lacks line');
      return `"${LINE(2)}" in store + DOM, count ${chat.filter((c) => c === LINE(2)).length}`;
    });

    await check('L5', 'Effects On: gold level-up ring/sparkles played (>0 live arcs)', async () => {
      expect(gold1 > 0, `gold max ${gold1}`);
      return `max live gold arcs ${gold1}`;
    });

    await check('L6', 'popup dismisses by tap (not blocking afterwards)', async () => {
      await g.tapSelector('.levelup');
      await g.waitFor(async () => (await T('popups()')) === 0, {
        timeoutMs: 1500,
        label: 'popup gone',
      });
      return 'popup removed after tap';
    });

    await check('L7', 'skills grid shows new level', async () => {
      await tapText('[role=tab]', 'Skills');
      await g.waitFor(() => g.eval('!!document.querySelector(".skill-cell")'), {
        timeoutMs: 3000,
        label: 'grid',
      });
      const lbl = await g.eval(
        `document.querySelector('.skill-cell[aria-label^="Woodcutting"]')?.getAttribute('aria-label')`,
      );
      expect(lbl === 'Woodcutting level 2', 'grid label ' + lbl);
      const lv = await g.eval(
        `document.querySelector('.skill-cell[aria-label^="Woodcutting"] .skill-level')?.textContent`,
      );
      expect(lv === '2', 'cell level ' + lv);
      return `grid "${lbl}", cell level ${lv}`;
    });

    await check('L8', 'popup auto-dismisses by timeout (~4 s)', async () => {
      await T('justBelow(3)');
      await chopOne();
      await g.waitFor(() => T('popup()'), { timeoutMs: 3000, label: 'popup' });
      const shown = Date.now();
      await g.waitFor(async () => (await T('popups()')) === 0, {
        timeoutMs: 6000,
        label: 'popup timeout',
      });
      const ms = Date.now() - shown;
      expect(ms > 2500 && ms < 5500, `popup lived ${ms} ms`);
      return `popup lived ~${ms} ms (spec 4000)`;
    });

    await check(
      'L9',
      'two level-ups in a row: one popup, shows latest, no stacking, timer restarts',
      async () => {
        await T('justBelow(4)');
        await chopOne();
        await g.waitFor(async () => (await T('popup()'))?.text.includes('level is now 4'), {
          timeoutMs: 3000,
          label: 'popup4',
        });
        const first = Date.now();
        await g.sleep(1500); // the popup timer is wall-clock: age the first popup 1.5 s before the second level-up
        await T('justBelow(5)');
        await chopOne();
        await g.waitFor(async () => (await T('popup()'))?.text.includes('level is now 5'), {
          timeoutMs: 3000,
          label: 'popup5',
        });
        const n = await T('popups()');
        const p = await T('popup()');
        expect(n === 1, `${n} popups`);
        expect(p.text.includes('level is now 5'), p.text);
        // the first popup's 4 s timer would have ended at first+4000; a restarted timer must still show it after that
        await g.sleep(Math.max(0, first + 4600 - Date.now()));
        const still = await T('popups()');
        expect(still === 1, 'second popup died with first popup timer');
        await g.waitFor(async () => (await T('popups()')) === 0, {
          timeoutMs: 4000,
          label: 'popup gone',
        });
        const chat = await g.chatLines();
        expect(chat.includes(LINE(4)) && chat.includes(LINE(5)), 'chat lines missing');
        return `1 popup (level 5), survived first timer, then dismissed; chat has L4 + L5 lines`;
      },
    );

    await check(
      'L10',
      'Effects Off: level applied + popup shows, NO gold fx; restore On',
      async () => {
        await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'off' } })`);
        await T('justBelow(6)');
        await T('startSampler()');
        await chopOne();
        const pop = await g.waitFor(() => T('popup()'), { timeoutMs: 3000, label: 'popup' });
        await window_();
        const lvl = await T('lvl()');
        const max = await T('max()');
        expect(lvl === 6, 'level ' + lvl);
        expect(max === 0, 'gold fx with Effects Off: ' + max);
        expect(pop, 'popup missing with Effects Off');
        await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on' } })`);
        await g.tapSelector('.levelup');
        return `level 6, gold max ${max}, popup shown`;
      },
    );

    await check(
      'L11',
      'Settings > Level-up popup Off (real tap): popup suppressed, level + chat still applied',
      async () => {
        const sw = `switchState('Level-up popup')`;
        await g.tapSelector('[aria-label="Settings"]');
        await g.waitFor(() => T(sw), { timeoutMs: 3000, label: 'switch' });
        expect((await T(sw)) === 'true', 'default not On');
        await tapText('[role=switch]', 'Level-up popup', true);
        await g.waitFor(async () => (await T(sw)) === 'false', {
          timeoutMs: 2000,
          label: 'toggle did not turn Off',
        });
        await g.tapSelector('[aria-label="Close settings"]');
        await T('justBelow(7)');
        await chopOne();
        await g.waitChat(LINE(7));
        await window_();
        const lvl = await T('lvl()');
        const n = await T('popups()');
        const storeNotice = await g.eval('window.__idleRpg.store.getState().levelUp');
        expect(lvl === 7, 'level ' + lvl);
        expect(n === 0 && storeNotice === null, `popup ${n} store ${JSON.stringify(storeNotice)}`);
        // turn back On and verify popup returns
        await g.tapSelector('[aria-label="Settings"]');
        await g.waitFor(() => T(sw), { timeoutMs: 3000, label: 'switch' });
        await tapText('[role=switch]', 'Level-up popup', true);
        await g.waitFor(async () => (await T(sw)) === 'true', {
          timeoutMs: 2000,
          label: 'did not turn back On',
        });
        await g.tapSelector('[aria-label="Close settings"]');
        await T('justBelow(8)');
        await chopOne();
        await g.waitFor(() => T('popup()'), { timeoutMs: 3000, label: 'popup back' });
        return `level 7 applied, 0 popups, chat line present; re-enabled -> popup returns`;
      },
    );
  }),
);
