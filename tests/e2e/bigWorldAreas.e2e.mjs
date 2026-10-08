// Big-world areas: banner + chat line + audio area kind (structural) + Music/Ambience Off. Port 5210.
// Audio "track" is observed structurally: ambience beds create BiquadFilters (type:freq) per area KIND, so the
// filter signature created after an area change identifies the kind that setArea() selected. Bus gains = music/ambience volume.
// Fast base: desktop + phone as parallel children (runParallel + withCombos, spy via initScripts = no extra reload),
// ?tickMs=60, waits on chat/audio/store state, banner observed by an in-page recorder (store subscription + DOM
// observer) over N game ticks instead of a 1.5 s wall-clock polling loop, budget 60 s. Run: node
// tests/e2e/bigWorldAreas.e2e.mjs (ports 9269-9270).
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9269; // C6 block; 2 combos use 9269-9270
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SPY = `(() => {
  const log = { comp: null, bq: [], gains: [] };
  window.__alog = log;
  const N = window.AudioContext;
  window.AudioContext = class extends N {
    constructor(...a) { super(...a); const self = this; this.__g = [];
      const g = this.createGain.bind(this); this.createGain = () => { const n = g(); self.__g.push(n); return n; };
      const b = this.createBiquadFilter.bind(this);
      this.createBiquadFilter = () => { const n = b(); if (self === log.comp) log.bq.push(n); return n; };
      const c = this.createDynamicsCompressor.bind(this);
      this.createDynamicsCompressor = () => { if (!log.comp) { log.comp = self; log.gains = self.__g; } return c(); }; } };
  // One-shot SFX (footsteps) also create bandpass filters with a randomised, non-integer pitch: ambience beds use round Hz only.
  window.__sig = (from) => log.bq.slice(from).filter((n) => Number.isInteger(n.frequency.value)).map((n) => n.type + ':' + n.frequency.value);
  window.__busGains = () => log.gains.slice(3, 5).map((g) => +g.gain.value.toFixed(3));
})();`;

// expected ambience bed signature per kind (from src/audio/data.ts via the page's module graph)
const KIND_SIG = `(async () => { const d = await import('/src/audio/data.ts'); const o = {};
  for (const [k, v] of Object.entries(d.AMBIENCE)) o[k] = v.layers.filter((l) => l.kind === 'bed').map((l) => l.filter + ':' + l.freq);
  return o; })()`;

const AREAS = [
  ['oak_ridge', 'Oak Ridge', 'forest', 70, 10],
  ['whispering_wood', 'Whispering Wood', 'forest', 50, 10],
  ['greatmere', 'Greatmere', 'lake', 30, 40],
  ['greatmere_shore', 'Greatmere Shore', 'shore', 30, 53],
  ['fernhaven', 'Fernhaven', 'village', 84, 58],
  ['fernhaven_bank', 'Fernhaven Bank', 'village', 94, 64],
];

// Banner recorder: every areaBanner stamp the store takes and every banner title the DOM shows from now on (seeded with
// the current ones, as the old first poll was). Stricter than polling every 60 ms: nothing between polls is missed.
const REC_START = `(() => { const s = window.__idleRpg.store; const r = (window.__brec = { stamps: new Set(), titles: new Set() });
  const title = () => { const t = document.querySelector('.area-banner-title')?.textContent; if (t) r.titles.add(t); };
  const stamp = (st) => r.stamps.add(st.areaBanner ? st.areaBanner.shownAt : null);
  window.__brecOff?.(); title(); stamp(s.getState());
  const un = s.subscribe(stamp); const mo = new MutationObserver(title);
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  window.__brecOff = () => { un(); mo.disconnect(); }; return true; })()`;
const REC_STOP = `(() => { window.__brecOff(); const r = window.__brec; return { titles: [...r.titles], stamps: [...r.stamps].filter(Boolean) }; })()`;
const INT_BEDS = 'window.__alog.bq.filter((n) => Number.isInteger(n.frequency.value)).length';

const run = async (g, vp) => {
  const phone = vp === 'phone';
  const sigs = await g.eval(KIND_SIG);
  const enters = async (name) =>
    (await g.chatLines()).filter((t) => t === `You enter ${name}.`).length;
  const bannerNames = () =>
    g.eval(`document.querySelector('.area-banner-title')?.textContent ?? null`);
  // real gesture so the AudioContext is created (areas only start scenes once a ctx exists)
  await g.tap(5, 5);
  await g
    .waitFor(() => g.eval('!!window.__alog.comp'), { timeoutMs: 5000, label: 'AudioContext' })
    .catch(() => {});
  expect(await g.eval('!!window.__alog.comp'), 'game AudioContext not created after first tap');
  // the unlock tap also walks the player (canvas tap): put them back in the village and wait until the village beds
  // are the last ones started (the audio has settled on 'village')
  await g.teleportSettled(18, 15);
  const villageLast = `(() => { const s = window.__sig(0), w = ${JSON.stringify(sigs.village)}; return w.length > 0 && JSON.stringify(s.slice(-w.length)) === JSON.stringify(w); })()`;
  await g
    .waitFor(() => g.eval(villageLast), { timeoutMs: 8000, label: 'village beds' })
    .catch(() => {});
  await g.waitTicks(3);
  let cur = 'village';

  // want = expected bed signature for this change ([] = same kind, no restart)
  const enter = async (name, kind, x, y, want) => {
    const n0 = await enters(name);
    const b0 = await g.eval('window.__alog.bq.length');
    await g.teleport(x, y, { settleMs: 0 });
    await g.waitFor(async () => (await enters(name)) > n0, { label: `chat enter ${name}` });
    await g.waitFor(bannerNames, { timeoutMs: 4000, label: 'banner shown' }).catch(() => {});
    await g.eval(REC_START);
    // beds start synchronously in setArea: wait for the expected ones (or, for "no restart", just the window below)
    if (want.length)
      await g
        .waitFor(async () => (await g.eval(`window.__sig(${b0})`)).length >= want.length, {
          timeoutMs: 4000,
          label: 'beds',
        })
        .catch(() => {});
    // re-show / extra-bed window: 12 game ticks of area detection (the old loop watched ~1.75 s = 29 ticks at 60 ms,
    // polling every 60 ms; the recorder sees every change)
    await g.waitTicks(12);
    const rec = await g.eval(REC_STOP);
    const sig = await g.eval(`window.__sig(${b0})`);
    return { ...rec, chat: (await enters(name)) - n0, sig, kind };
  };

  for (const [id, name, kind, x, y] of AREAS) {
    await check(
      `a-${id}`,
      `${name}: banner once, chat once, audio kind ${kind}${phone ? ' (phone)' : ''}`,
      async () => {
        expect(
          (await g.eval(
            `import('/src/features/world/index.ts').then(m => m.areaAt(${x}, ${y}).id)`,
          )) === id,
          'areaAt mismatch',
        );
        const want = cur === kind ? [] : sigs[kind];
        const r = await enter(name, kind, x, y, want);
        expect(r.chat === 1, `chat lines ${r.chat}`);
        expect(
          r.titles.length === 1 && r.titles[0] === name,
          `banner titles ${JSON.stringify(r.titles)}`,
        );
        expect(r.stamps.length === 1, `banner re-shown (${r.stamps.length} stamps)`);
        if (phone) {
          const b = await g.rect('.area-banner-title');
          const w = await g.eval('innerWidth');
          expect(
            b && b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= w,
            `banner off-screen ${JSON.stringify(b)}`,
          );
        }
        expect(
          JSON.stringify(r.sig) === JSON.stringify(want),
          `audio sig ${JSON.stringify(r.sig)} want ${JSON.stringify(want)} (kind ${kind}, prev ${cur})`,
        );
        cur = kind;
        return `titles ${r.titles}, chat ${r.chat}, sig ${JSON.stringify(r.sig)}`;
      },
    );
  }

  await check('stay', 'staying / moving inside an area does not re-trigger', async () => {
    const n0 = await enters('Fernhaven Bank');
    const b0 = await g.eval(INT_BEDS);
    // negative checks: give area detection the same ~6 ticks per move the old 400 ms settle did
    await g.teleport(92, 62, { settleMs: 0 });
    await g.waitTicks(6);
    await g.teleport(96, 66, { settleMs: 0 });
    await g.waitTicks(6);
    expect((await enters('Fernhaven Bank')) === n0, 'enter line repeated');
    expect((await g.eval(INT_BEDS)) === b0, 'audio restarted');
    return `chat ${n0} unchanged, no new beds`;
  });

  await check('reenter', 'walking out and back in re-triggers banner, chat, audio', async () => {
    const [, name, kind, x, y] = AREAS[2]; // Greatmere (lake)
    const s0 = await enters('Greatmere Shore');
    await g.teleport(30, 53, { settleMs: 0 }); // shore
    await g.waitFor(async () => (await enters('Greatmere Shore')) > s0, { label: 'shore entered' });
    await g.waitTicks(3); // shore beds started (synchronously in setArea) before the lake baseline is taken
    const r = await enter(name, kind, x, y, sigs.lake);
    expect(r.chat === 1 && r.titles[0] === name, `chat ${r.chat} banner ${r.titles}`);
    expect(JSON.stringify(r.sig) === JSON.stringify(sigs.lake), `sig ${JSON.stringify(r.sig)}`);
    expect((await enters(name)) >= 2, 'second enter line missing');
    return `second "You enter Greatmere." total ${await enters(name)}`;
  });

  if (!phone)
    await check('off', 'Settings Music/Ambience Off -> bus gains 0; back on restores', async () => {
      const before = await g.eval('window.__busGains()');
      expect(before[0] > 0 && before[1] > 0, `buses already silent ${before}`);
      await g.tapSelector('button[aria-label="Settings"]');
      const clickOff = async (label) =>
        g.eval(`(() => { const lab = [...document.querySelectorAll('.steps-label')].find((e) => e.textContent === ${JSON.stringify(label)});
          const b = lab.parentElement.querySelector('.steps-btn'); b.click(); return b.textContent; })()`);
      expect((await clickOff('Music')) === 'Off', 'music Off button not found');
      expect((await clickOff('Ambience')) === 'Off', 'ambience Off button not found');
      await g
        .waitFor(async () => JSON.stringify(await g.eval('window.__busGains()')) === '[0,0]', {
          timeoutMs: 3000,
          label: 'buses silent',
        })
        .catch(() => {});
      const off = await g.eval('window.__busGains()');
      expect(off[0] === 0 && off[1] === 0, `buses not silent ${off}`);
      // an area change while off still must not make sound: bus stays 0
      const w0 = await enters('Whispering Wood');
      await g.teleport(50, 10, { settleMs: 0 });
      await g.waitFor(async () => (await enters('Whispering Wood')) > w0, {
        label: 'area change while Off',
      });
      await g.waitTicks(3);
      expect(
        JSON.stringify(await g.eval('window.__busGains()')) === '[0,0]',
        'bus audible after area change while Off',
      );
      await g.eval(
        `(() => { for (const l of ['Music','Ambience']) { const lab = [...document.querySelectorAll('.steps-label')].find((e) => e.textContent === l); lab.parentElement.querySelectorAll('.steps-btn')[3].click(); } })()`,
      );
      await g
        .waitFor(
          async () => {
            const v = await g.eval('window.__busGains()');
            return v[0] > 0 && v[1] > 0;
          },
          { timeoutMs: 3000, label: 'buses restored' },
        )
        .catch(() => {});
      const on = await g.eval('window.__busGains()');
      expect(on[0] > 0 && on[1] > 0, `not restored ${on}`);
      return `before ${before}, off ${off}, restored ${on}`;
    });
};

await withCombos({ port: PORT, budgetMs: BUDGET_MS, initScripts: [SPY] }, COMBOS, run);
