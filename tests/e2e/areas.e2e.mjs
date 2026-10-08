// Area banner + area audio e2e. Run: node tests/e2e/areas.e2e.mjs (base port E2E_PORT or 9060).
// Fast base: desktop + phone as parallel children, ?tickMs=60 (walking is tick-driven; the banner lifetime is
// performance.now()-based in the store/AreaBanner, so fast ticks do not change what is measured). The first tap is a
// real CDP gesture (pointerdown on window unlocks audio). Audio is observed STRUCTURALLY (AudioContext state, node
// counts, gain values/ramps); nothing is heard. Banner on/off times come from an in-page MutationObserver and the
// "You enter X." time from a store subscriber, so no CDP sampling loops.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT ?? 9060);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SPY = `
(() => {
  window.__ctxs = [];
  const log = { gains: [], osc: 0, src: 0, ramps: [], comp: null };
  window.__alog = log;
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...a) {
      super(...a);
      window.__ctxs.push(this);
      const self = this;
      const g = this.createGain.bind(this);
      this.__g = []; this.createGain = () => { const n = g(); self.__g.push(n); return n; };
      const o = this.createOscillator.bind(this);
      this.createOscillator = () => { if (self === log.comp) log.osc++; return o(); };
      const b = this.createBufferSource.bind(this);
      this.createBufferSource = () => { if (self === log.comp) log.src++; return b(); };
      const c = this.createDynamicsCompressor.bind(this);
      // the game's own context is the one that builds the master limiter (Phaser makes its own context too)
      this.createDynamicsCompressor = () => { if (!log.comp) { log.comp = self; log.gains = self.__g; } return c(); };
    }
  };
  const orig = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (v, t) {
    const i = log.gains.findIndex((n) => n.gain === this);
    if (i >= 0) log.ramps.push({ v, t, g: i });
    return orig.call(this, v, t);
  };
  // banner DOM lifetimes per title: [{title, t0, t1}]; a title change (banner reused for the next area) closes one
  const bn = (window.__bn = []);
  let cur = null;
  new MutationObserver(() => {
    const e = document.querySelector('.area-banner-title');
    const t = e ? e.textContent : null;
    if (cur && t !== cur.title) { cur.t1 = performance.now(); cur = null; }
    if (t !== null && !cur) { cur = { title: t, t0: performance.now(), t1: null }; bn.push(cur); }
  }).observe(document, { childList: true, subtree: true, characterData: true });
  // "You enter X." chat line times: {name: [t...]}
  const enter = (window.__enter = {});
  const hook = () => { const H = window.__idleRpg; if (!H || !H.store) return setTimeout(hook, 20); let n = H.store.getState().game.chat.length;
    H.store.subscribe((s) => { const c = s.game.chat; for (let i = n; i < c.length; i++) { const m = /^You enter (.+)\\.$/.exec(c[i].text); if (m) (enter[m[1]] ??= []).push(performance.now()); } n = c.length; }); };
  hook();
  window.__a = {
    audio: () => { const c = log.comp; if (!c) return null;
      return { state: c.state, n: window.__ctxs.length, gains: log.gains.slice(0, 5).map((g) => +g.gain.value.toFixed(3)), osc: log.osc, src: log.src, ramps: log.ramps.length }; },
    rampsSince: (i) => log.ramps.slice(i),
    fadeIns: () => log.ramps.filter((r) => r.v === 1 && r.g >= 5).length,
    banner: () => { const e = document.querySelector('.area-banner-title'); return e ? e.textContent : null; },
  };
})();
`;

const AREAS = [
  ['Mirror Lake', 36, 12],
  ['Willowbrook Green', 20, 12],
  ['Oak Grove', 20, 21],
  ['Southern Shore', 20, 27],
];

const warns = []; // console warnings + Log errors from the very first load (listener set before forEachCombo's load)
const run = forEachCombo(COMBOS, async (g, vp) => {
  const A = (x) => g.eval(`window.__a.${x}`);
  const countEnter = async (name) =>
    (await g.chatLines()).filter((t) => t === `You enter ${name}.`).length;
  const settle = () => g.waitIdle({ timeoutMs: 40000 });

  await check('a0', 'before any tap: game audio context not yet created', async () => {
    const a = await A('audio()');
    expect(
      a === null || a.state === 'suspended',
      'game AudioContext RUNNING before a gesture: ' + JSON.stringify(a),
    );
    if (a)
      return `${vp}: KNOWN P3: game context is created before any tap (pageshow -> onVisible -> audio.unlock()), stays suspended: ${JSON.stringify(a)}`;
    return `${vp}: no game AudioContext (the one with the limiter) before first gesture; total contexts ${await g.eval('window.__ctxs.length')} (Phaser creates its own)`;
  });

  // First real tap (user gesture): unlocks audio. It may also start a walk (canvas corner); at 60 ms ticks that walk
  // covers 10x the ground of the old 600 ms run, so put the player back on the spawn tile (Willowbrook Green) at once.
  await g.tap(5, 5);
  await g.teleport(18, 15, { settleMs: 0 });
  let base;
  await check(
    'a1',
    'first tap: AudioContext created (1), running, 5 gains (master + 4 buses), area scene started',
    async () => {
      // was a fixed 600 ms sleep: wait for the scene to start, then assert everything
      await g
        .waitFor(
          async () => {
            const a = await A('audio()');
            return a && a.state === 'running' && a.osc > 0 && a.src > 0;
          },
          { timeoutMs: 5000, label: 'audio running with music/ambience nodes' },
        )
        .catch(() => {});
      const a = await A('audio()');
      expect(a, 'no AudioContext after first tap');
      expect(a.n <= 2, `contexts ${a.n}`);
      expect(a.state === 'running', 'state ' + a.state);
      expect(a.gains.length >= 5, 'gains ' + a.gains.length);
      expect(a.osc > 0 && a.src > 0, `no music/ambience nodes osc=${a.osc} src=${a.src}`);
      base = a;
      return `${vp}: ${JSON.stringify(a)}`;
    },
  );

  const start = await g.state('movement.position');
  const walkTo = async (name, x, y) => {
    const before = await A('audio()');
    const rampIdx = before.ramps;
    const n0 = await countEnter(name);
    const b0 = await g.eval('window.__bn.length');
    await g.walkTo(x, y);
    await g.waitFor(async () => (await countEnter(name)) > n0, {
      timeoutMs: 40000,
      label: `chat enter ${name}`,
    });
    // banner shown and then removed from the DOM (8 s cap, as before)
    const bn = await g.waitFor(
      () =>
        g.eval(
          `(() => { const at = window.__enter[${JSON.stringify(name)}].at(-1);
            // the first banner that STARTED with this area's chat line (at fast ticks the walk can cross another area,
            // e.g. The Wilds, a tick or two earlier; the old 600 ms run read the title after the chat line, same thing)
            const b = window.__bn.slice(${b0}).find((b) => b.t0 >= at - 5);
            return b && b.t1 !== null ? { ...b, enterAt: at, others: window.__bn.slice(${b0}).filter((x) => x !== b).map((x) => x.title) } : null; })()`,
        ),
      { timeoutMs: 8000, label: `banner ${name} shown and gone` },
    );
    await settle();
    const after = await A('audio()');
    return {
      seen: true,
      title: bn.title,
      others: bn.others,
      shownFor: Math.round(bn.t1 - bn.enterAt), // chat line -> banner gone (old file: same span, polled)
      before,
      after,
      ramps: await A(`rampsSince(${rampIdx})`),
    };
  };

  // go to the village first (spawn 18,15 is Willowbrook Green; it was announced silently at boot)
  expect(
    start.x >= 12 && start.x <= 30 && start.y >= 3 && start.y <= 17,
    'start not in the village ' + JSON.stringify(start),
  );
  let prevOsc = base?.osc ?? 0;
  for (const [name, x, y] of AREAS) {
    await check(
      `b-${name}`,
      `walk to ${name} (${x},${y}): banner, chat line, audio crossfade`,
      async () => {
        const r = await walkTo(name, x, y);
        expect(r.seen, 'banner never appeared');
        expect(r.title === name, `banner title ${r.title}`);
        // total visible 300+2000+600 = 2900ms; the DOM node stays until then.
        expect(r.shownFor > 1500 && r.shownFor < 4500, `banner visible ${r.shownFor}ms`);
        expect(
          r.after.osc > prevOsc,
          `no new oscillators on area change (${prevOsc} -> ${r.after.osc})`,
        );
        expect(r.ramps.length >= 4, `expected fade-in/out ramps, got ${r.ramps.length}`);
        expect(r.after.n === base.n, 'extra AudioContext');
        const ev = `${vp}: osc ${prevOsc}->${r.after.osc}, ramps +${r.ramps.length} (targets ${[...new Set(r.ramps.map((q) => q.v))].join('/')}), banner "${r.title}" ${r.shownFor}ms after chat line${r.others.length ? ` (passed: ${r.others.join(', ')})` : ''}`;
        prevOsc = r.after.osc;
        return ev;
      },
    );
    await check(
      `c-${name}`,
      `banner gone afterwards (${name}); store banner cleared by ~4 s`,
      async () => {
        // was a fixed 1500 ms sleep then one read: same 1.5 s bound, returns as soon as both are clear
        await g
          .waitFor(
            async () => (await A('banner()')) === null && (await g.store('s.areaBanner')) === null,
            { timeoutMs: 1500, label: 'banner DOM + store clear' },
          )
          .catch(() => {});
        expect((await A('banner()')) === null, 'banner DOM still present');
        expect((await g.store('s.areaBanner')) === null, 'store areaBanner not cleared');
        return 'DOM + store clear';
      },
    );
  }

  await check(
    'd1',
    'same-area movement does not re-trigger (chat count, audio nodes, banner)',
    async () => {
      const before = await A('audio()');
      before.fi = await A('fadeIns()');
      const n0 = await countEnter('Southern Shore');
      await g.walkTo(10, 27);
      await settle();
      await g.walkTo(30, 28);
      await settle();
      const after = await A('audio()');
      after.fi = await A('fadeIns()');
      expect((await countEnter('Southern Shore')) === n0, 'enter line repeated');
      expect(
        after.fi === before.fi,
        `area crossfade re-triggered (fade-ins ${before.fi} -> ${after.fi})`,
      );
      expect((await g.store('s.areaBanner')) === null, 'banner shown');
      return `${vp}: chat count unchanged (${n0}), scene fade-ins to 1 stay at ${before.fi} (osc ${before.osc}->${after.osc} is only scheduled ambience/music notes)`;
    },
  );

  await check(
    'e1',
    'hidden tab: AudioContext suspended, prefs.sound.muted untouched; visible: resumed',
    async () => {
      const muted = () => g.store('s.prefs.sound.muted');
      const mutedBefore = await muted();
      await g.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange')); })()`);
      await g.waitFor(async () => (await A('audio()')).state === 'suspended', {
        timeoutMs: 3000,
        label: 'suspended',
      });
      const hiddenMuted = await muted();
      await g.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange')); })()`);
      await g.waitFor(async () => (await A('audio()')).state === 'running', {
        timeoutMs: 3000,
        label: 'running',
      });
      const mutedAfter = await muted();
      expect(mutedBefore === hiddenMuted && hiddenMuted === mutedAfter, 'muted pref changed');
      return `${vp}: suspended then running; muted ${mutedBefore} throughout`;
    },
  );

  await check(
    'f1',
    'Music/Ambience volume 0 -> those bus gains 0; others unchanged; restore',
    async () => {
      const gains = async () => (await A('audio()')).gains; // [master, sfx, ui, music, ambience]
      const setVol = (ch, v) => g.store(`s.setSoundVolume(${JSON.stringify(ch)}, ${v})`);
      // was a fixed 200 ms sleep after each change: wait (<= 1 s) for the gains, then assert
      const until = (pred) =>
        g.waitFor(async () => pred(await gains()), { timeoutMs: 1000 }).catch(() => {});
      const g0 = await gains();
      await setVol('music', 0);
      await setVol('ambience', 0);
      await until((x) => x[3] === 0 && x[4] === 0);
      const g1 = await gains();
      expect(g1[3] === 0 && g1[4] === 0, `buses not silent ${JSON.stringify(g1)}`);
      expect(g1[1] === g0[1] && g1[2] === g0[2] && g1[0] === g0[0], 'sfx/ui/master changed');
      await setVol('music', 0.6);
      await setVol('ambience', 0.8);
      await until((x) => x[3] === 0.6 && x[4] === 0.8);
      const g2 = await gains();
      expect(g2[3] === 0.6 && g2[4] === 0.8, 'not restored ' + JSON.stringify(g2));
      return `${vp}: before ${JSON.stringify(g0)} zero ${JSON.stringify(g1)} restored ${JSON.stringify(g2)}`;
    },
  );

  // lib's 'console' check covers console errors + exceptions; this keeps the old file's stricter warnings/log errors
  await check('g1', 'no console warnings / log errors during the run', async () => {
    const real = warns.filter((e) => !e.includes('/favicon.ico'));
    expect(real.length === 0, real.join(' | '));
    return `${vp}: 0 warnings (ignored ${warns.length - real.length} favicon.ico 404s)`;
  });
});

await withGame({ port: PORT, budgetMs: BUDGET_MS }, async (g) => {
  // the audio/banner spy must be in place before forEachCombo's fresh load
  await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  g.cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning')
      warns.push(
        `console.warning: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`,
      );
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      warns.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  await g.cdp.send('Log.enable');
  return run(g);
});
