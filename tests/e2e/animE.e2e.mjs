// QA slice anim-e: Animations On / Reduced / Off for chop, mine, net + walk. Port 9013 (+1 per combo; E2E_PORT overrides).
// Fast base: desktop + phone as parallel children, ?tickMs=60 (ticks are irrelevant: the animator is hand-driven), budget 60 s.
// Deterministic: the scene's animator (window.__idleRpg.scene().animator) is driven by hand with synthetic times, so the
// swing phase is known exactly (no gameplay sessions, depleting nodes or sampling windows). The scene's own
// setState/update calls are muted; the preference path (store.setPref -> applyVisualPrefs -> animator.setMode) stays live.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9013;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const DEG = 180 / Math.PI;
const S = 'window.__idleRpg.store.getState()';
const N = 50; // samples per swing period; the impact phase 0.68 is sample 34
const IMPACT_I = 35; // phase 0.70: inside the tap window (0.68-0.78), just after the strike key
const DRIVER = `(() => {
  const N = ${N};
  const H = window.__idleRpg, W = (window.__W = {});
  const TOOLS = ['axe', 'pick', 'net'];
  const pv = () => H.scene().playerView;
  const rig = () => pv().container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const find = (o) => {
    if (TOOLS.includes(o.name) && o.visible) return o;
    for (const c of o.list ?? []) { const r = find(c); if (r) return r; }
    return null;
  };
  W.snap = () => {
    const p = pv(), r = rig(), tool = find(p.container);
    let sig = null, kind = 'none';
    if (tool) { sig = 0; let o = tool; kind = 'back';
      while (o && o !== p.container) { sig += o.rotation; if (o === r) kind = 'front'; o = o.parentContainer; } }
    const nm = (n) => r.list.find((o) => o.name === n);
    const th = (c) => c.list.find((o) => o.type === 'Container');
    return { sig, kind, tool: tool ? tool.name : null, rx: r.x, ry: r.y, rsx: r.scaleX, rsy: r.scaleY,
      bsx: p.body.scaleX, bsy: p.body.scaleY, tb: r.list[0].rotation, tf: r.list[1].rotation,
      ub: nm('armBackUpper').rotation, uf: nm('armFrontUpper').rotation, sb: th(r.list[0]).rotation, sf: th(r.list[1]).rotation };
  };
  /** Mute the scene's own animator calls once; keep the originals for the manual drive. */
  W.mute = () => { const a = H.scene().animator; if (W.o) return; W.o = { u: a.update, s: a.setState, a };
    a.update = () => {}; a.setState = () => {}; };
  /** Drive state with a given facing for cycles periods (first period = warm-up, past the pose blend); sample the rest. */
  W.series = (state, facing, tool, cycles = 2, running = false) => {
    const { u, s, a } = W.o, P = a.swingPeriodMs, T = 1e6; let impacts = 0; a.onImpact = () => impacts++;
    s.call(a, state, { facing, toolItemId: tool, running }); u.call(a, T);
    const rows = [];
    for (let i = 1; i <= N * (cycles + 1); i++) { u.call(a, T + (i * P) / N);
      if (i >= N) rows.push({ i: i - N, ...W.snap() }); }
    a.onImpact = undefined; s.call(a, 'idle', { facing }); u.call(a, T + 99 * P);
    return { rows, impacts };
  };
})()`;
const BODY = ['rx', 'ry', 'rsx', 'rsy', 'bsx', 'bsy'];
const p2p = (a) => Math.max(...a) - Math.min(...a);
const f = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const bodyP2p = (rows) => Math.max(...BODY.map((k) => p2p(rows.map((r) => r[k]))));
const wrap = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
/** Tool angle swing in degrees, unwrapped by taking steps modulo a turn. */
const unwrap = (rows) => {
  const out = [];
  for (const r of rows)
    out.push(out.length ? out.at(-1) + wrap(r.sig - rows[out.length - 1].sig) : r.sig);
  return out;
};
const toolP2p = (rows) => p2p(unwrap(rows)) * DEG;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g) => {
    await g.eval(DRIVER);
    await g.eval('window.__W.mute()');
    const setAnim = (m) => g.eval(`${S}.setPref({ visuals: { animations: '${m}' } })`);
    const series = (state, facing, tool, running = false) =>
      g.eval(`window.__W.series(${JSON.stringify(state)}, '${facing}', '${tool}', 2, ${running})`);
    const acts = [
      ['chop', 'bronze_axe'],
      ['mine', 'bronze_pickaxe'],
      ['fishNet', 'small_fishing_net'],
    ];
    for (const [name, tool] of acts) {
      await setAnim('off');
      const faces = [];
      for (const fc of ['e', 'w', 's', 'n']) {
        await check(`off-${name}-${fc}`, `Off ${name} facing ${fc}: static pose`, async () => {
          const { rows } = await series(name, fc, tool);
          expect(
            rows.length >= N * 2 && rows.every((r) => r.sig !== null),
            `tool visible ${rows.length}`,
          );
          const tp = toolP2p(rows),
            bp = bodyP2p(rows);
          expect(tp < 0.01 && bp < 1e-6, `tool p2p ${f(tp)} deg, body p2p ${bp}`);
          faces.push({ sig: rows[0].sig, kind: rows[0].kind });
          return `${rows[0].tool} sig ${f(rows[0].sig * DEG)} deg (${rows[0].kind}) p2p ${f(tp)}`;
        });
      }
      await check(
        `off-${name}-facings`,
        `Off ${name}: identical tool angle across facings`,
        async () => {
          const ab = faces.map((x) => Math.abs(x.sig) * DEG);
          const d = p2p(ab);
          expect(
            faces.length === 4 && d < 0.05,
            `abs ${ab.map((v) => f(v)).join(',')} spread ${f(d)}`,
          );
          return `abs ${ab.map((v) => f(v, 2)).join(',')} spread ${f(d)} deg`;
        },
      );
      const seq = {};
      for (const m of ['on', 'reduced', 'off', 'on']) {
        await setAnim(m); // live toggle through the real pref path
        seq[m === 'on' && seq.on ? 'on2' : m] = await series(name, 'e', tool);
      }
      await check(
        `red-${name}`,
        `Reduced ${name}: small tap, body still; live toggle`,
        async () => {
          const on = toolP2p(seq.on.rows),
            red = toolP2p(seq.reduced.rows);
          const off = toolP2p(seq.off.rows),
            on2 = toolP2p(seq.on2.rows),
            bb = bodyP2p(seq.reduced.rows);
          expect(on > 3, `on tool p2p only ${f(on)}`);
          expect(red > 0.2 && red < on * 0.7, `reduced tool p2p ${f(red)} vs on ${f(on)}`);
          expect(bb < 1e-6, `reduced body p2p ${bb}`);
          expect(off < 0.01, `off tool p2p ${f(off)}`);
          expect(on2 > 3, `back to on: p2p ${f(on2)}`);
          return `tool p2p on ${f(on, 1)} / reduced ${f(red, 1)} / off ${f(off)} / on again ${f(on2, 1)}; reduced body ${bb}`;
        },
      );
      await check(`red-${name}-tap`, `Reduced ${name}: exactly one tap per swing`, async () => {
        const u = unwrap(seq.reduced.rows.slice(0, N)),
          rest = u[0];
        let taps = 0,
          was = false;
        for (const v of u) {
          const away = Math.abs(v - rest) * DEG > 0.5;
          if (away && !was) taps++;
          was = away;
        }
        const onImp = seq.on.impacts,
          redImp = seq.reduced.impacts;
        expect(taps === 1, `${taps} taps in one period`);
        expect(
          name === 'fishNet' || (onImp === 3 && redImp === 3),
          `impacts on ${onImp} reduced ${redImp} (3 periods)`,
        );
        return `taps ${taps}; impacts on ${onImp} / reduced ${redImp}`;
      });
      await check(`red-${name}-down`, `Reduced ${name}: tap pose = On's strike pose`, async () => {
        if (name === 'fishNet') return 'n/a (net has its own tap: dip, no strike)';
        const a = unwrap(seq.on.rows)[IMPACT_I],
          b = unwrap(seq.reduced.rows)[IMPACT_I];
        const d = Math.abs(wrap(a - b)) * DEG;
        // Measured (deterministic): chop 0.4, mine 0.4 deg (tap key aligned with On's strike pose); old keys were 7-15 deg, a missing tap 38+.
        expect(
          d < 2,
          `strike pose on ${f(a * DEG, 1)} vs reduced ${f(b * DEG, 1)} (${f(d, 1)} deg apart)`,
        );
        return `strike on ${f(a * DEG, 1)} / reduced ${f(b * DEG, 1)}: ${f(d, 1)} deg apart`;
      });
    }
    const walk = {};
    for (const m of ['on', 'reduced', 'off']) {
      await setAnim(m);
      walk[m] = (await series('walk', 'e', 'bronze_axe')).rows;
    }
    await check(
      'walk',
      'Walk: On swings limbs; Reduced and Off keep limbs and body still',
      async () => {
        const limb = (rows) =>
          Math.max(
            ...['tb', 'tf', 'ub', 'uf', 'sb', 'sf', 'ry'].map((k) => p2p(rows.map((r) => r[k]))),
          );
        const { on, reduced: red, off } = walk;
        expect(limb(on) > 0.05, `on limb p2p ${limb(on)}`);
        expect(limb(red) < 1e-6 && limb(off) < 1e-6, `reduced ${limb(red)} off ${limb(off)}`);
        return `limb p2p on ${f(limb(on))} reduced ${limb(red)} off ${limb(off)}`;
      },
    );
    await setAnim('on');
  }),
);
