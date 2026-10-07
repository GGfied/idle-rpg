/* global fetch, console */
// Area banner + area audio e2e. Own dev server on :5183 (never 5173), fresh headless Chrome profile.
// The first tap is a real CDP mouse click (a genuine user gesture), so no autoplay flag is needed.
// Audio is observed STRUCTURALLY (AudioContext state, node counts, gain values/ramps); nothing is heard.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const PORT = 5183;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];

async function check(id, title, fn) {
  try {
    results.push({ id, title, ok: true, evidence: (await fn()) ?? '' });
  } catch (e) {
    results.push({ id, title, ok: false, evidence: e.message });
  }
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

async function startVite() {
  const proc = spawn(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`vite did not start on ${PORT}`);
}

const PAGE_HELPERS = `
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
  let P;
  Object.defineProperty(window, 'Phaser', { configurable: true, get: () => P, set: (v) => {
    P = v; const Orig = v.Game;
    const W = function (...a) { const g = new Orig(...a); window.__phaserGame = g; return g; };
    W.prototype = Orig.prototype; v.Game = W; } });
  const store = () => window.__phaserGame.scene.getScene('world').deps.store;
  window.__e2e = {
    ready: () => { try { const s = window.__phaserGame.scene.getScene('world'); return !!(s && s.player && s.deps.store); } catch { return false; } },
    pos: () => store().getState().game.movement.position,
    pathLen: () => store().getState().game.movement.path.length,
    walkTo: (x, y) => store().getState().walkTo({ x, y }),
    chat: () => store().getState().game.chat.map((c) => c.text),
    banner: () => { const e = document.querySelector('.area-banner-title'); return e ? e.textContent : null; },
    bannerStore: () => store().getState().areaBanner,
    prefs: () => store().getState().prefs,
    setVol: (ch, v) => store().getState().setSoundVolume(ch, v),
    teleportAndTick: null,
    audio: () => { const c = log.comp; if (!c) return null;
      return { state: c.state, n: window.__ctxs.length, gains: log.gains.slice(0, 5).map((g) => +g.gain.value.toFixed(3)), osc: log.osc, src: log.src, ramps: log.ramps.length }; },
    rampsSince: (i) => log.ramps.slice(i),
    fadeIns: () => log.ramps.filter((r) => r.v === 1 && r.g >= 5).length,
  };
})();
`;

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const errors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        `exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`,
      );
    else if (
      m.method === 'Runtime.consoleAPICalled' &&
      ['error', 'warning'].includes(m.params.type)
    )
      errors.push(
        `console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`,
      );
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
  const E = (x) => cdp.eval(`window.__e2e.${x}`);
  const waitFor = async (what, pred, ms, poll = 100) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(poll);
    }
  };
  const settle = () => waitFor('player to stop', async () => (await E('pathLen()')) === 0, 40000);
  const countEnter = async (name) =>
    (await E('chat()')).filter((t) => t === `You enter ${name}.`).length;

  try {
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('game ready', () => E('ready()').catch(() => false), 20000);
    await sleep(800);

    await check('a0', 'before any tap: game audio context not yet created', async () => {
      const a = await E('audio()');
      expect(
        a === null || a.state === 'suspended',
        'game AudioContext RUNNING before a gesture: ' + JSON.stringify(a),
      );
      if (a)
        return (
          'KNOWN P3: game context is created before any tap (pageshow -> onVisible -> audio.unlock()), stays suspended: ' +
          JSON.stringify(a)
        );
      return (
        'no game AudioContext (the one with the limiter) before first gesture; total contexts ' +
        (await cdp.eval('window.__ctxs.length')) +
        ' (Phaser creates its own)'
      );
    });

    // First real tap (user gesture) on the canvas: unlocks audio.
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    await sleep(600);
    let base;
    await check(
      'a1',
      'first tap: AudioContext created (1), running, 5 gains (master + 4 buses), area scene started',
      async () => {
        const a = await E('audio()');
        expect(a, 'no AudioContext after first tap');
        expect(a.n <= 2, `contexts ${a.n}`);
        expect(a.state === 'running', 'state ' + a.state);
        expect(a.gains.length >= 5, 'gains ' + a.gains.length);
        expect(a.osc > 0 && a.src > 0, `no music/ambience nodes osc=${a.osc} src=${a.src}`);
        base = a;
        return JSON.stringify(a);
      },
    );

    const start = await E('pos()');
    const walkTo = async (name, x, y) => {
      const before = await E('audio()');
      const rampIdx = before.ramps;
      const n0 = await countEnter(name);
      await E(`walkTo(${x}, ${y})`);
      await waitFor(`chat enter ${name}`, async () => (await countEnter(name)) > n0, 40000, 150);
      const t0 = Date.now();
      const titles = [];
      let seen = false;
      // Sample the banner DOM until gone.
      while (Date.now() - t0 < 8000) {
        const b = await E('banner()');
        if (b) {
          seen = true;
          titles.push(b);
        } else if (seen) break;
        await sleep(100);
      }
      const shownFor = Date.now() - t0;
      await settle();
      const after = await E('audio()');
      return {
        seen,
        title: titles[0],
        shownFor,
        before,
        after,
        ramps: await E(`rampsSince(${rampIdx})`),
      };
    };

    const AREAS = [
      ['Mirror Lake', 36, 12],
      ['Willowbrook Green', 20, 12],
      ['Oak Grove', 20, 21],
      ['Southern Shore', 20, 27],
    ];
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
          // total visible 300+2000+600 = 2900ms; the DOM node stays until then. Tolerance for polling.
          expect(r.shownFor > 1500 && r.shownFor < 4500, `banner visible ${r.shownFor}ms`);
          expect(
            r.after.osc > prevOsc,
            `no new oscillators on area change (${prevOsc} -> ${r.after.osc})`,
          );
          expect(r.ramps.length >= 4, `expected fade-in/out ramps, got ${r.ramps.length}`);
          expect(r.after.n === base.n, 'extra AudioContext');
          const ev = `osc ${prevOsc}->${r.after.osc}, ramps +${r.ramps.length} (targets ${[...new Set(r.ramps.map((q) => q.v))].join('/')}), banner "${r.title}" ${r.shownFor}ms after chat line`;
          prevOsc = r.after.osc;
          return ev;
        },
      );
      await check(
        `c-${name}`,
        `banner gone afterwards (${name}); store banner cleared by ~4 s`,
        async () => {
          await sleep(1500);
          expect((await E('banner()')) === null, 'banner DOM still present');
          expect((await E('bannerStore()')) === null, 'store areaBanner not cleared');
          return 'DOM + store clear';
        },
      );
    }

    await check(
      'd1',
      'same-area movement does not re-trigger (chat count, audio nodes, banner)',
      async () => {
        const before = await E('audio()');
        before.fi = await E('fadeIns()');
        const n0 = await countEnter('Southern Shore');
        await E('walkTo(10, 27)');
        await settle();
        await E('walkTo(30, 28)');
        await settle();
        const after = await E('audio()');
        after.fi = await E('fadeIns()');
        expect((await countEnter('Southern Shore')) === n0, 'enter line repeated');
        expect(
          after.fi === before.fi,
          `area crossfade re-triggered (fade-ins ${before.fi} -> ${after.fi})`,
        );
        expect((await E('bannerStore()')) === null, 'banner shown');
        return `chat count unchanged (${n0}), scene fade-ins to 1 stay at ${before.fi} (osc ${before.osc}->${after.osc} is only scheduled ambience/music notes)`;
      },
    );

    await check(
      'e1',
      'hidden tab: AudioContext suspended, prefs.sound.muted untouched; visible: resumed',
      async () => {
        const mutedBefore = (await E('prefs()')).sound.muted;
        await cdp.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange')); })()`);
        await waitFor('suspended', async () => (await E('audio()')).state === 'suspended', 3000);
        const hiddenMuted = (await E('prefs()')).sound.muted;
        await cdp.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange')); })()`);
        await waitFor('running', async () => (await E('audio()')).state === 'running', 3000);
        const mutedAfter = (await E('prefs()')).sound.muted;
        expect(mutedBefore === hiddenMuted && hiddenMuted === mutedAfter, 'muted pref changed');
        return `suspended then running; muted ${mutedBefore} throughout`;
      },
    );

    await check(
      'f1',
      'Music/Ambience volume 0 -> those bus gains 0; others unchanged; restore',
      async () => {
        const g0 = (await E('audio()')).gains; // [master, sfx, ui, music, ambience]
        await E(`setVol('music', 0)`);
        await E(`setVol('ambience', 0)`);
        await sleep(200);
        const g1 = (await E('audio()')).gains;
        expect(g1[3] === 0 && g1[4] === 0, `buses not silent ${JSON.stringify(g1)}`);
        expect(g1[1] === g0[1] && g1[2] === g0[2] && g1[0] === g0[0], 'sfx/ui/master changed');
        await E(`setVol('music', 0.6)`);
        await E(`setVol('ambience', 0.8)`);
        await sleep(200);
        const g2 = (await E('audio()')).gains;
        expect(g2[3] === 0.6 && g2[4] === 0.8, 'not restored ' + JSON.stringify(g2));
        return `before ${JSON.stringify(g0)} zero ${JSON.stringify(g1)} restored ${JSON.stringify(g2)}`;
      },
    );

    await check('g1', 'no console errors/warnings/exceptions during the run', async () => {
      const real = errors.filter((e) => !e.includes('/favicon.ico'));
      expect(real.length === 0, real.join(' | '));
      return `0 errors (ignored ${errors.length - real.length} favicon.ico 404s: no icon in index.html or public/, known P3)`;
    });
  } finally {
    await cdp.close();
    vite.kill();
  }
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} (${r.id}) ${r.title}\n        ${r.evidence}`);
  }
  console.log(`\n${results.length} checks, ${bad} failed`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
