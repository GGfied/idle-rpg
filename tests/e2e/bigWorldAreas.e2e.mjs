// Big-world areas: banner + chat line + audio area kind (structural) + Music/Ambience Off. Port 5210.
// Audio "track" is observed structurally: ambience beds create BiquadFilters (type:freq) per area KIND, so the
// filter signature created after an area change identifies the kind that setArea() selected. Bus gains = music/ambience volume.
import { check, expect, forEachViewport, withGame } from './lib.mjs';

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
  window.__sig = (from) => log.bq.slice(from).map((n) => n.type + ':' + n.frequency.value);
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

const run = forEachViewport(['desktop', 'phone'], async (g, vp) => {
  await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  await g.load();
  const phone = vp === 'phone';
  const sigs = await g.eval(KIND_SIG);
  const enters = async (name) =>
    (await g.chatLines()).filter((t) => t === `You enter ${name}.`).length;
  const bannerNames = () =>
    g.eval(`document.querySelector('.area-banner-title')?.textContent ?? null`);
  const bannerStamp = () => g.store('s.areaBanner ? s.areaBanner.shownAt : null');
  // real gesture so the AudioContext is created (areas only start scenes once a ctx exists)
  await g.tap(5, 5);
  await g.sleep(600);
  expect(await g.eval('!!window.__alog.comp'), 'game AudioContext not created after first tap');
  // the unlock tap also walks the player (canvas tap): put them back in the village and let audio settle
  await g.teleport(18, 15, { settleMs: 1200 });
  let cur = 'village';

  const enter = async (name, kind, x, y) => {
    const n0 = await enters(name);
    const b0 = await g.eval('window.__alog.bq.length');
    await g.teleport(x, y, { settleMs: 200 });
    await g.waitFor(async () => (await enters(name)) > n0, { label: `chat enter ${name}` });
    await g.sleep(250);
    const stamps = new Set();
    const titles = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      const t = await bannerNames();
      if (t) titles.add(t);
      stamps.add(await bannerStamp());
      await g.sleep(60);
    }
    const sig = await g.eval(`window.__sig(${b0})`);
    return {
      titles: [...titles],
      stamps: [...stamps].filter(Boolean),
      chat: (await enters(name)) - n0,
      sig,
      kind,
    };
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
        const r = await enter(name, kind, x, y);
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
        const want = cur === kind ? [] : sigs[kind];
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
    const b0 = await g.eval('window.__alog.bq.length');
    await g.teleport(92, 62, { settleMs: 400 });
    await g.teleport(96, 66, { settleMs: 400 });
    expect((await enters('Fernhaven Bank')) === n0, 'enter line repeated');
    expect((await g.eval('window.__alog.bq.length')) === b0, 'audio restarted');
    return `chat ${n0} unchanged, no new beds`;
  });

  await check('reenter', 'walking out and back in re-triggers banner, chat, audio', async () => {
    const [, name, kind, x, y] = AREAS[2]; // Greatmere (lake)
    await g.teleport(30, 53, { settleMs: 300 }); // shore
    await g.sleep(400);
    const r = await enter(name, kind, x, y);
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
      await g.sleep(300);
      const off = await g.eval('window.__busGains()');
      expect(off[0] === 0 && off[1] === 0, `buses not silent ${off}`);
      // an area change while off still must not make sound: bus stays 0
      await g.teleport(50, 10, { settleMs: 500 });
      expect(
        JSON.stringify(await g.eval('window.__busGains()')) === '[0,0]',
        'bus audible after area change while Off',
      );
      await g.eval(
        `(() => { for (const l of ['Music','Ambience']) { const lab = [...document.querySelectorAll('.steps-label')].find((e) => e.textContent === l); lab.parentElement.querySelectorAll('.steps-btn')[3].click(); } })()`,
      );
      await g.sleep(300);
      const on = await g.eval('window.__busGains()');
      expect(on[0] > 0 && on[1] > 0, `not restored ${on}`);
      return `before ${before}, off ${off}, restored ${on}`;
    });
});

await withGame({ port: 5210 }, run);
