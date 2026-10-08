// Settings + preferences e2e. Run: node tests/e2e/settings.e2e.mjs   (port 9017 +1 per combo; E2E_PORT overrides)
// Fast base: desktop / phone portrait / phone landscape run as 3 parallel children (lib runParallel), ?tickMs=60,
// every wait is on DOM/store state or page frames (no fixed sleeps, no Date.now polling), budget 60 s.
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9017;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const PAGE = `(() => {
  window.__master = null; window.__osc = 0;
  const NA = window.AudioContext;
  window.__ctx = [];
  window.AudioContext = class extends NA { constructor(...a){ super(...a); window.__ctx.push(this);} };
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...r) {
    if (typeof DynamicsCompressorNode !== 'undefined' && d instanceof DynamicsCompressorNode && this instanceof GainNode) window.__master = this;
    return oc.call(this, d, ...r);
  };
  const co = BaseAudioContext.prototype.createOscillator;
  BaseAudioContext.prototype.createOscillator = function () { window.__osc++; return co.call(this); };
  let P;
  Object.defineProperty(window, 'Phaser', { configurable: true, get: () => P, set: (v) => { P = v; const O = v.Game;
    const W = function (...a) { const g = new O(...a); window.__phaserGame = g; return g; }; W.prototype = O.prototype; v.Game = W; } });
  const scene = () => window.__phaserGame && window.__phaserGame.scene.getScene('world');
  const st = () => scene().deps.store;
  window.__t = {
    ready: () => { try { const s = scene(); return !!(s && s.player && s.deps.store); } catch { return false; } },
    state: () => st().getState(),
    prefs: () => JSON.parse(localStorage.getItem('idle-rpg:prefs') || 'null'),
    master: () => window.__master ? window.__master.gain.value : null,
    osc: () => window.__osc,
    ctxState: () => window.__ctx.map((c) => c.state),
    xpTexts: () => scene().children.list.filter((o) => o.type === 'Text' && /^\\+\\d+/.test(o.text) && o.visible && o.alpha > 0).map((o) => o.text),
    spawns: async () => { const w = await import('/src/features/world/index.ts'); return { trees: w.TREE_SPAWNS }; },
    toClient: (wx, wy) => { const s = scene(), cam = s.cameras.main, v = cam.worldView, cv = s.game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    // isometric world: tile -> client px (dy lifts to the tree body)
    tileClient: async (tx, ty, dy = 0) => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(tx, ty); return window.__t.toClient(w.x, w.y + dy); },
    // settings DOM helpers
    sw: (label) => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === label); return b ? { checked: b.getAttribute('aria-checked'), desc: b.parentElement.querySelector('.steps-desc').textContent } : null; },
    swClick: (label) => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === label); b.click(); },
    step: (label) => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === label); const sel = g.querySelector('[aria-checked=true]'); return { sel: sel ? sel.textContent : null, desc: g.querySelector('.steps-desc').textContent }; },
    stepClick: (label, text) => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === label); [...g.querySelectorAll('button')].find((b) => b.textContent === text).click(); },
    has: (sel) => !!document.querySelector(sel),
    dim: () => document.querySelector('.steps-dim')?.getAttribute('data-dim'),
    dimStyle: () => { const e = document.querySelector('.steps-dim'); const c = getComputedStyle(e); return { opacity: c.opacity, pe: c.pointerEvents }; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    tabsSelected: () => [...document.querySelectorAll('[role=tab]')].map((t) => t.getAttribute('aria-selected')),
    // frame-driven observation (no wall-clock sampling): max XP-drop texts seen per frame since xpWatch(), and n rAFs
    xpWatch: () => { window.__xpMax = 0; if (window.__xpLoop) return; window.__xpLoop = true;
      const f = () => { try { window.__xpMax = Math.max(window.__xpMax, window.__t.xpTexts().length); } catch { /* scene gone */ } requestAnimationFrame(f); }; requestAnimationFrame(f); },
    xpMax: () => window.__xpMax,
    raf: (n = 2) => new Promise((r) => { const f = (k) => (k <= 0 ? r(1) : requestAnimationFrame(() => f(k - 1))); f(n); }),
  };
})();`;

const J = JSON.stringify;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [PAGE] },
  forEachCombo(COMBOS, async (g, vp) => {
    const { cdp } = g;
    const logErrors = [];
    cdp.on((m) => {
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
        logErrors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
    });
    await cdp.send('Log.enable');
    const T = (e) => cdp.eval(`window.__t.${e}`);
    const raf = (n = 2) => T(`raf(${n})`);
    /** Wait (bounded) for a raw page expression (window.__t.* spelled out); never throws, so the original assertion right after reports the failure. */
    const until = (expr, timeoutMs = 3000) =>
      g
        .waitFor(() => cdp.eval(expr).catch(() => false), { timeoutMs, label: expr })
        .then(
          () => true,
          () => false,
        );
    const tap = (x, y) => g.tap(x, y);
    // rect without scrollIntoView (as before): a covered or off-screen control must fail, not be scrolled to
    const tapSel = async (sel) => {
      const r = await T(`rect(${J(sel)})`);
      expect(r, 'no element ' + sel);
      await tap(r.x, r.y);
    };
    const key = async (k) => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k });
      await raf();
    };
    const open = async () => {
      if (!(await T('has(".settings")'))) await tapSel('button[aria-label="Settings"]');
      await until('window.__t.has(".settings")');
      const diag = async () =>
        cdp.eval(
          `(() => { const b = document.querySelector('button[aria-label="Settings"]'); if (!b) return 'no gear button'; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return 'gear ' + JSON.stringify([r.left, r.top, r.width, r.height]) + ' top=' + (e && (e.tagName + '.' + e.className)) + ' hud=' + JSON.stringify(document.querySelector('.hud')?.dataset) + ' hudCls=' + document.querySelector('.hud')?.className + ' dialogs=' + [...document.querySelectorAll('[role=dialog]')].map((d) => d.className + ':' + (d.getAttribute('aria-label') || '')).join('|'); })()`,
        );
      if (!(await T('has(".settings")')) && process.env.DIAG_SHOT) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(process.env.DIAG_SHOT, Buffer.from(data, 'base64'));
      }
      expect(await T('has(".settings")'), 'settings did not open: ' + (await diag()));
    };
    /** Reload KEEPING localStorage (g.load() clears it): marker on the old window, wait for the new one to be ready. */
    const reloadKeep = async () => {
      await cdp.eval('window.__oldPage = 1');
      await cdp.send('Page.reload');
      await g.waitFor(
        () => cdp.eval('!window.__oldPage && window.__t && window.__t.ready()').catch(() => false),
        { timeoutMs: 25000, label: 'reloaded + ready' },
      );
    };
    // B1 (2026-10-08): after Show HUD Off -> On the canvas must follow #game within ~500 ms (no window resize), the gear
    // must be topmost, and real taps on tabs + gear must respond.
    const HUD_M = `(() => { const c = document.querySelector('canvas:not(.minimap)').getBoundingClientRect(); const gm = document.getElementById('game').getBoundingClientRect(); const b = document.querySelector('button[aria-label="Settings"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { cw: Math.round(c.width), sw: Math.round(window.__phaserGame.scale.width), bw: Math.round(window.__phaserGame.scale.canvasBounds.width), gw: Math.round(gm.width), gearTop: e && (e.closest('button[aria-label="Settings"]') ? 'gear' : e.tagName + '.' + e.className) }; })()`;
    const hudOk = (m) =>
      Math.abs(m.cw - m.gw) <= 2 &&
      Math.abs(m.sw - m.gw) <= 2 &&
      Math.abs(m.bw - m.gw) <= 2 &&
      m.gearTop === 'gear';
    const afterHudRestore = async () => {
      // the ~500 ms limit is the thing tested: wait on the layout, at most 500 ms
      await g
        .waitFor(async () => hudOk(await cdp.eval(HUD_M)), { timeoutMs: 500, intervalMs: 50 })
        .catch(() => {});
      const m = await cdp.eval(HUD_M);
      expect(
        Math.abs(m.cw - m.gw) <= 2 && Math.abs(m.sw - m.gw) <= 2 && Math.abs(m.bw - m.gw) <= 2,
        'canvas not following #game after HUD restore: ' + JSON.stringify(m),
      );
      expect(m.gearTop === 'gear', 'gear covered after HUD restore: ' + JSON.stringify(m));
      // Settings (if still open from the test) hides the tab selection by design; close it by tap first.
      if (await T('has(".settings")')) {
        await tapSel('button[aria-label="Close settings"]');
        await until('!document.querySelector(".settings")');
      }
      const sel = [];
      const dbg = [];
      for (const i of [1, 0]) {
        const r = await cdp.eval(
          `(() => { const t = document.querySelectorAll('[role=tab]')[${i}]; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
        );
        await tap(r.x, r.y);
        await until(
          `document.querySelectorAll('[role=tab]')[${i}].getAttribute('aria-selected') === 'true'`,
          2000,
        );
        dbg.push(
          await cdp.eval(
            `(() => { const e = document.elementFromPoint(${r.x}, ${r.y}); return [${Math.round(r.x)}, ${Math.round(r.y)}, e && e.tagName + '.' + e.className, document.querySelector('.hud').dataset.folded, document.querySelectorAll('[role=tab]')[${i}].getAttribute('aria-selected')].join(' '); })()`,
          ),
        );
        sel.push(
          await cdp.eval(
            `document.querySelectorAll('[role=tab]')[${i}].getAttribute('aria-selected')`,
          ),
        );
      }
      expect(
        sel.every((x) => x === 'true'),
        'tabs did not respond to taps: ' + sel + ' | ' + dbg.join(' ; '),
      );
      await tapSel('button[aria-label="Settings"]');
      await until('window.__t.has(".settings")');
      expect(await T('has(".settings")'), 'gear tap did not open Settings after HUD restore');
      await tapSel('button[aria-label="Close settings"]');
      await until('!document.querySelector(".settings")');
      return `canvas css ${m.cw} / phaser ${m.sw} / bounds ${m.bw} vs #game ${m.gw}, gear topmost, tabs ${sel}, gear opens`;
    };
    const prefs = async () => {
      const e = await T('prefs()');
      return e && e.prefs ? e.prefs : e;
    };
    const dump = (p) => JSON.stringify(p);
    const swIs = (label, v) => until(`(window.__t.sw(${J(label)}) || {}).checked === '${v}'`);
    const stepIs = (label, txt) => until(`window.__t.step(${J(label)}).sel === ${J(txt)}`);

    // ============== desktop 1280x800 ==============
    if (vp === 'desktop') {
      await tap(640, 400); // first gesture unlocks audio

      await check(
        'd1',
        'gear opens Settings, no tab selected; Escape closes; gear again then X closes',
        async () => {
          const before = await T('tabsSelected()');
          await tapSel('button[aria-label="Settings"]');
          await until('window.__t.has(".settings")');
          expect(await T('has(".settings")'), 'not open');
          const sel = await T('tabsSelected()');
          expect(
            sel.every((s) => s === 'false'),
            'tab selected while open: ' + sel,
          );
          await key('Escape');
          await until('!document.querySelector(".settings")');
          expect(!(await T('has(".settings")')), 'Escape did not close');
          await tapSel('button[aria-label="Settings"]');
          await until('window.__t.has(".settings")');
          await tapSel('button[aria-label="Close settings"]');
          await until('!document.querySelector(".settings")');
          expect(!(await T('has(".settings")')), 'X did not close');
          const after = await T('tabsSelected()');
          return `tabs before ${before} open ${sel} after ${after}`;
        },
      );

      await check(
        'd2',
        'Sound On by default; Off dims rows, keeps values, silences (master gain 0, no oscillators)',
        async () => {
          await open();
          const s0 = await T('sw("Sound")');
          expect(s0.checked === 'true', 'Sound not On by default: ' + JSON.stringify(s0));
          expect((await T('dim()')) === 'false', 'dim on while sound on');
          const vols0 = await T('state().prefs.sound.volumes');
          const m0 = await T('master()');
          expect(m0 > 0, 'master gain not >0 when on: ' + m0);
          await T('swClick("Sound")');
          await swIs('Sound', 'false');
          await until('window.__t.master() === 0');
          const s1 = await T('sw("Sound")');
          expect(s1.checked === 'false', 'not Off');
          expect((await T('dim()')) === 'true', 'rows not dimmed');
          const ds = await T('dimStyle()');
          const m1 = await T('master()');
          expect(m1 === 0, 'master gain not 0 when off: ' + m1);
          const vols1 = await T('state().prefs.sound.volumes');
          expect(JSON.stringify(vols0) === JSON.stringify(vols1), 'volumes changed');
          const o0 = await T('osc()');
          await T('state().playTestSound()');
          await raf(4); // negative: same frames the unmuted case below needs to create its oscillators
          const o1 = await T('osc()');
          const st = await T('state().sound.muted');
          expect(st === true, 'store muted not true');
          await T('swClick("Sound")');
          await until('window.__t.master() > 0');
          const m2 = await T('master()');
          expect(m2 > 0, 'master not restored: ' + m2);
          await T('state().playTestSound()');
          await until(`window.__t.osc() > ${o1}`);
          const o2 = await T('osc()');
          expect(o2 > o1, 'no oscillator created after unmute');
          return `gain on=${m0} off=${m1} back=${m2}; dim style ${JSON.stringify(ds)}; oscillators while muted +${o1 - o0}, after unmute +${o2 - o1}; volumes kept ${JSON.stringify(vols1)}`;
        },
      );

      await check(
        'd3',
        'volume rows: every step stores the pref and updates description',
        async () => {
          await open();
          const rows = [
            ['Master', 'master'],
            ['Game sounds', 'sfx'],
            ['Menu clicks', 'ui'],
            ['Music', 'music'],
            ['Ambience', 'ambience'],
          ];
          const labels = ['Off', '1', '2', '3', '4', '5'];
          const out = [];
          for (const [label, id] of rows) {
            const descs = new Set();
            let prev = null;
            for (const l of labels) {
              await T(`stepClick(${J(label)}, ${J(l)})`);
              await stepIs(label, l);
              await until(
                `(() => { const p = window.__t.prefs(); const v = p && (p.prefs || p).sound.volumes[${J(id)}]; return ${l === 'Off'} ? v === 0 : v > ${prev ?? -1}; })()`,
              );
              const p = await prefs();
              const v = p.sound.volumes[id];
              const s = await T(`step(${J(label)})`);
              expect(s.sel === l, `${label}: selected ${s.sel} != ${l}`);
              expect(l !== 'Off' || v === 0, `${label} Off stored ${v}`);
              expect(prev === null || v > prev, `${label} step ${l} stored ${v} not > ${prev}`);
              prev = v;
              descs.add(s.desc);
              if (l === 'Off') expect(v === 0, 'off not 0');
            }
            expect(descs.size === 6, `${label}: only ${descs.size} distinct descriptions`);
            out.push(`${id}:${prev}`);
          }
          return 'final values ' + out.join(' ') + '; 6 distinct descriptions per row';
        },
      );

      await check(
        'd4',
        'Screen toggles hide minimap/orbs/tracker/chatbox; Show HUD Off leaves only restore button',
        async () => {
          await open();
          const map = { Minimap: '.minimap-wrap', Orbs: '.orbs', Chatbox: '.chatbox' };
          const ev = [];
          for (const [label, sel] of Object.entries(map)) {
            expect(await T(`has(${J(sel)})`), sel + ' missing initially');
            await T(`swClick(${J(label)})`);
            await until(`!document.querySelector(${J(sel)})`);
            expect(!(await T(`has(${J(sel)})`)), `${label} off but ${sel} still present`);
            const p = await prefs();
            expect(!!p.hud, 'hud prefs missing');
            await T(`swClick(${J(label)})`);
            await until(`window.__t.has(${J(sel)})`);
            expect(await T(`has(${J(sel)})`), `${label} on but ${sel} missing`);
            ev.push(label + ' ok');
          }
          // skill tracker: needs xp; flip the store tracker directly, then toggle
          await cdp.eval(
            `window.__phaserGame.scene.getScene('world').deps.store.setState({ tracker: { skill: 'woodcutting', untilMs: 1e12 } })`,
          );
          await until('window.__t.has(".tracker")');
          expect(await T('has(".tracker")'), 'tracker not shown with it on');
          await T('swClick("Skill tracker")');
          await until('!document.querySelector(".tracker")');
          expect(!(await T('has(".tracker")')), 'tracker still shown with it off');
          await T('swClick("Skill tracker")');
          await until('window.__t.has(".tracker")');
          expect(await T('has(".tracker")'), 'tracker not back');
          ev.push('Skill tracker ok');
          await T('swClick("Show HUD")');
          await until('window.__t.has(".hud-show")');
          const left = await cdp.eval(
            `(() => ({ show: !!document.querySelector('.hud-show'), chat: !!document.querySelector('.chatbox'), mini: !!document.querySelector('.minimap-wrap'), orbs: !!document.querySelector('.orbs'), tracker: !!document.querySelector('.tracker'), hudHidden: document.querySelector('aside.hud')?.getAttribute('data-hidden'), hudRect: (() => { const r = document.querySelector('aside.hud')?.getBoundingClientRect(); return r && [r.width, r.height]; })() }))()`,
          );
          expect(
            left.show && !left.chat && !left.mini && !left.orbs && !left.tracker,
            'HUD off state: ' + JSON.stringify(left),
          );
          ev.push('HUD off: ' + JSON.stringify(left));
          await tapSel('.hud-show');
          await until('!document.querySelector(".hud-show") && window.__t.has(".chatbox")');
          expect(!(await T('has(".hud-show")')) && (await T('has(".chatbox")')), 'restore failed');
          ev.push('restore ok');
          ev.push('B1 ' + (await afterHudRestore()));
          return ev.join('; ');
        },
      );

      await check(
        'd5',
        'Notifications: level-up popup, area names, game messages gate outputs',
        async () => {
          await open();
          const ev = [];
          const lvl = () =>
            T(`state().noteEvents([{ type: 'levelUp', skill: 'woodcutting', level: 7 }])`);
          await lvl();
          await until('window.__t.has(".levelup")');
          expect(await T('has(".levelup")'), 'popup missing when on');
          ev.push('popup on ok');
          await tapSel('.levelup');
          await until('!document.querySelector(".levelup")');
          await T('swClick("Level-up popup")');
          await swIs('Level-up popup', 'false');
          await lvl();
          await raf(4); // negative: the "on" popup above rendered within these frames
          expect(!(await T('has(".levelup")')), 'popup shown when off');
          expect((await T('state().levelUp')) === null, 'store levelUp set while off');
          ev.push('popup off ok');
          await T('swClick("Level-up popup")');
          await swIs('Level-up popup', 'true');
          // area names
          await T('state().showAreaBanner("Test Vale")');
          await until('window.__t.has(".area-banner")');
          expect(await T('has(".area-banner")'), 'banner missing when on');
          await T('swClick("Area names")');
          await until('!document.querySelector(".area-banner")');
          expect(!(await T('has(".area-banner")')), 'banner still visible after toggling off');
          const r = await T('state().showAreaBanner("Other Vale")');
          await raf(4);
          expect(r === null && !(await T('has(".area-banner")')), 'banner shown while off');
          ev.push('area names ok');
          await T('swClick("Area names")');
          await swIs('Area names', 'true');
          // game messages: examine a tree (routine line)
          const { trees } = await T('spawns()');
          const id = trees[0].nodeId;
          const chat = () => T('state().game.chat.map((c) => c.text)');
          const n0 = (await chat()).length;
          await T(`state().examineTree(${J(id)})`);
          await until(`window.__t.state().game.chat.length > ${n0}`);
          const n1 = (await chat()).length;
          expect(n1 > n0, 'examine added no line when on');
          await T('swClick("Game messages in chat")');
          await swIs('Game messages in chat', 'false');
          await T(`state().examineTree(${J(id)})`);
          await raf(4);
          const n2 = (await chat()).length;
          expect(n2 === n1, `routine line added while off (${n1} -> ${n2})`);
          await T('state().walkTo({ x: 0, y: 0 })');
          await g.waitTicks(3); // unreachable/blocked: should be important (evidence only)
          const after = await chat();
          ev.push(
            `game messages off: routine line dropped (${n1}->${n2}); after walkTo(0,0) last chat "${after.at(-1)}"`,
          );
          await T('swClick("Game messages in chat")');
          await swIs('Game messages in chat', 'true');
          return ev.join('; ');
        },
      );

      await check('d6', 'XP pop-ups gate real chop XP drops; chopping works', async () => {
        await key('Escape');
        const { trees } = await T('spawns()');
        const s0 = await T('state().game.movement.position');
        const d = (t) => Math.max(Math.abs(t.x - s0.x), Math.abs(t.y - s0.y));
        const free = trees.sort((a, b) => d(a) - d(b));
        let tree = null;
        for (const t of free) {
          const p = await T(`tileClient(${t.x}, ${t.y}, -16)`);
          const top = await cdp.eval(`document.elementFromPoint(${p.x}, ${p.y})?.tagName`);
          if (top === 'CANVAS') {
            tree = t;
            break;
          }
        }
        expect(tree, 'no visible tree');
        const tapTree = async () => {
          const q = await T(`tileClient(${tree.x}, ${tree.y}, -16)`);
          await tap(q.x, q.y);
        };
        const chop = async (ms) => {
          const xp0 = await T('state().game.progression.xp.woodcutting');
          await T('xpWatch()'); // per-frame max of visible XP-drop texts from here on
          await tapTree();
          // keep-alive: a session can end before the first hit, so re-tap the tree when idle
          const stop = g.every(1500, async () => {
            if (
              (await T('state().game.gathering.session')) === null &&
              (await T('state().game.movement.path.length')) === 0
            )
              await tapTree();
          });
          const got = await g
            .waitFor(async () => (await T('state().game.progression.xp.woodcutting')) > xp0, {
              timeoutMs: ms,
              label: 'wc xp',
            })
            .then(
              () => true,
              () => false,
            );
          stop();
          // the drop is spawned on the XP event: On returns as soon as it shows; Off watches 1.5 s of frames for it
          await until('window.__t.xpMax() > 0', 1500);
          return { got, seen: await T('xpMax()') };
        };
        // 200 ms ticks (not realTime): at 60 ms a gather session ends within ~1 s, before the first log
        await g.setTickMs(200);
        const on = await chop(30000);
        expect(on.got, 'no wc xp gained');
        expect(on.seen > 0, 'XP gained but no XP drop text with pop-ups On');
        await open();
        await T('swClick("XP pop-ups")');
        await swIs('XP pop-ups', 'false');
        await key('Escape');
        await until('window.__t.xpTexts().length === 0', 5000); // the On drop has faded before the Off phase
        const off = await chop(30000);
        await g.setTickMs(60);
        expect(off.got, 'no wc xp 2nd chop');
        expect(off.seen === 0, `XP drop shown while off (${off.seen})`);
        await open();
        await T('swClick("XP pop-ups")');
        await key('Escape');
        return `xp drops seen on=${on.seen} off=${off.seen}`;
      });

      await check(
        'd7',
        'Visuals Effects/Animations On/Reduced/Off stored, descriptions change, no errors',
        async () => {
          await open();
          const ev = [];
          for (const label of ['Effects', 'Animations']) {
            const key_ = label === 'Effects' ? 'vfx' : 'animations';
            const descs = new Set();
            for (const [txt, val] of [
              ['Reduced', 'reduced'],
              ['Off', 'off'],
              ['On', 'on'],
            ]) {
              await T(`stepClick(${J(label)}, ${J(txt)})`);
              await stepIs(label, txt);
              await until(
                `(() => { const p = window.__t.prefs(); return !!p && (p.prefs || p).visuals[${J(key_)}] === ${J(val)}; })()`,
              );
              const p = await prefs();
              const v = p.visuals[key_];
              expect(v === val, `${label} ${txt} stored ${v}`);
              const s = await T(`step(${J(label)})`);
              expect(s.sel === txt, 'selection ' + s.sel);
              descs.add(s.desc);
            }
            expect(descs.size === 3, label + ' descriptions not distinct');
            ev.push(label + ' ok');
          }
          return ev.join(', ');
        },
      );

      await check(
        'd8',
        'persist across reload: set a distinctive config, reload, compare',
        async () => {
          await open();
          await T('stepClick("Master", "2")');
          await T('stepClick("Music", "Off")');
          await T('stepClick("Ambience", "5")');
          await T('stepClick("Effects", "Off")');
          await T('stepClick("Animations", "Reduced")');
          for (const l of ['Minimap', 'Skill tracker', 'XP pop-ups', 'Area names'])
            await T(`swClick(${J(l)})`);
          await T('swClick("Sound")');
          // wait until the last change (Sound off) is in storage instead of a fixed 400 ms
          await until(
            '(() => { const p = window.__t.prefs(); return !!p && (p.prefs || p).sound.muted === true; })()',
          );
          const before = dump(await prefs());
          await reloadKeep();
          const mid = dump(await prefs());
          expect(before === mid, `stored prefs changed over reload: ${before} vs ${mid}`);
          await open();
          const ui = await cdp.eval(
            `(() => ({ sound: window.__t.sw('Sound').checked, minimap: window.__t.sw('Minimap').checked, tracker: window.__t.sw('Skill tracker').checked, xp: window.__t.sw('XP pop-ups').checked, area: window.__t.sw('Area names').checked, master: window.__t.step('Master').sel, music: window.__t.step('Music').sel, amb: window.__t.step('Ambience').sel, fx: window.__t.step('Effects').sel, anim: window.__t.step('Animations').sel, mm: !!document.querySelector('.minimap-wrap'), dim: window.__t.dim() }))()`,
          );
          expect(
            ui.sound === 'false' &&
              ui.minimap === 'false' &&
              ui.tracker === 'false' &&
              ui.xp === 'false' &&
              ui.area === 'false',
            'toggles not restored ' + JSON.stringify(ui),
          );
          expect(
            ui.master === '2' &&
              ui.music === 'Off' &&
              ui.amb === '5' &&
              ui.fx === 'Off' &&
              ui.anim === 'Reduced',
            'steps not restored ' + JSON.stringify(ui),
          );
          expect(
            !ui.mm && ui.dim === 'true',
            'minimap/dim not applied after reload ' + JSON.stringify(ui),
          );
          await T('stepClick("Master", "3")');
          return 'UI after reload ' + JSON.stringify(ui);
        },
      );
    }

    // ============== phone 390x844 portrait / 844x390 landscape (own children; forEachCombo cleared prefs) ==============
    if (vp === 'phone' || vp === 'landscape') {
      const name = vp === 'phone' ? 'portrait' : 'landscape';
      const { w, h } = await cdp.eval('({ w: innerWidth, h: innerHeight })');
      await tap(w / 2, h / 3);
      await check(
        `p-${name}`,
        `phone ${w}x${h}: gear tap opens, tab not selected, fits, toggles + steps work by tap, Escape/X close`,
        async () => {
          const gr = await T('rect(\'button[aria-label="Settings"]\')');
          expect((gr && gr.w >= 40 && gr.h >= 40) || gr, 'no gear');
          await tapSel('button[aria-label="Settings"]');
          await until('window.__t.has(".settings")');
          expect(await T('has(".settings")'), 'not open by tap (gear ' + JSON.stringify(gr) + ')');
          const sel = await T('tabsSelected()');
          expect(
            sel.every((s) => s === 'false'),
            'tab selected ' + sel,
          );
          const box = await T('rect("aside.hud")');
          expect(
            box.x - box.w / 2 >= -1 && box.x + box.w / 2 <= w + 1 && box.y + box.h / 2 <= h + 1,
            'settings overflows viewport ' + JSON.stringify(box),
          );
          // tap targets
          const small = await cdp.eval(
            `[...document.querySelectorAll('.settings button')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.slice(0, 14), Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[2] < 44 || x[1] < 30)`,
          );
          // scroll the last section into view and tap a step + toggle
          await cdp.eval(`document.querySelector('.settings .steps-dim').scrollIntoView()`);
          await raf();
          await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings .steps-btn')].find((x) => x.textContent === '3'); b.scrollIntoView({ block: 'center' }); })()`,
          );
          await raf();
          const sb = await cdp.eval(
            `(() => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Game sounds'); g.scrollIntoView({block:'center'}); const b = [...g.querySelectorAll('button')].find((x) => x.textContent === '2'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await raf();
          await tap(sb.x, sb.y);
          await until(
            '(() => { const p = window.__t.prefs(); return !!p && Math.abs((p.prefs || p).sound.volumes.sfx - 0.4) < 0.25; })()',
          );
          const p = await prefs();
          expect(
            p && Math.abs(p.sound.volumes.sfx - 0.4) < 0.25,
            'tap on step did not store: ' + dump(p),
          );
          const tg = await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === 'Minimap'); b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await raf();
          await tap(tg.x, tg.y);
          await swIs('Minimap', 'false');
          expect((await T('sw("Minimap")')).checked === 'false', 'tap on toggle did nothing');
          await T('swClick("Minimap")');
          const xr = await T('rect(\'button[aria-label="Close settings"]\')');
          await cdp.eval(`document.querySelector('.hud-body').scrollTop = 0`);
          await raf();
          await tapSel('button[aria-label="Close settings"]');
          await until('!document.querySelector(".settings")');
          expect(!(await T('has(".settings")')), 'X tap did not close after scrolling to top');
          const xAfterScrollOffscreen = xr.y < 0 || xr.y > h;
          return `X scrolled off-screen after scrolling content: ${xAfterScrollOffscreen} (y=${Math.round(xr.y)}); panel ${JSON.stringify(box)} small targets: ${JSON.stringify(small).slice(0, 300)}`;
        },
      );
      await check(
        `p-${name}-hud`,
        `phone ${name}: Show HUD Off then restore by tap; area banner/level-up fit`,
        async () => {
          await open();
          await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === 'Show HUD'); b.scrollIntoView({block:'center'}); })()`,
          );
          await raf();
          const r = await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === 'Show HUD'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await tap(r.x, r.y);
          await until('window.__t.has(".hud-show")');
          expect(await T('has(".hud-show")'), 'no restore button on phone');
          const hr = await T('rect(".hud-show")');
          const vis = await cdp.eval(
            `(() => { const e = document.querySelector('.hud-show'); const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) === e; })()`,
          );
          const cover = await cdp.eval(
            `(() => { const e = document.querySelector('.hud-show'); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return { top: t && (t.tagName + '.' + t.className), vw: innerWidth, vh: innerHeight, r: [r.left, r.top, r.width, r.height].map(Math.round) }; })()`,
          );
          expect(vis, 'restore button covered/off-screen: ' + JSON.stringify(cover));
          await tapSel('.hud-show');
          await until('!document.querySelector(".hud-show")');
          expect(!(await T('has(".hud-show")')), 'restore failed');
          return 'restore button ' + JSON.stringify(hr) + '; B1 ' + (await afterHudRestore());
        },
      );
    }

    await check(
      'z',
      'no Log-domain errors in the run (favicon ignored; console errors: lib check)',
      async () => {
        const real = logErrors.filter((e) => !/favicon/.test(e));
        expect(real.length === 0, real.join(' | '));
        return `0 errors (${logErrors.length - real.length} favicon ignored)`;
      },
    );
  }),
);
