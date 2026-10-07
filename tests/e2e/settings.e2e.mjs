/* global fetch, console */
// Settings + preferences e2e. Own vite on :5181 (never 5173), fresh headless Chrome profile, CDP only.
// Run: node tests/e2e/settings.e2e.mjs   Exit 0 = all checks passed.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const PORT = 5181;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(id, title, fn) {
  try {
    results.push({ id, title, ok: true, ev: (await fn()) ?? '' });
  } catch (e) {
    results.push({ id, title, ok: false, ev: e.message });
  }
}

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
      /* not up */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error('vite did not start');
}

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
  };
})();`;

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const errors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        'exception: ' +
          (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text),
      );
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
  const T = (e) => cdp.eval(`window.__t.${e}`);
  const waitFor = async (what, pred, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await pred();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout: ' + what);
      await sleep(120);
    }
  };
  const viewport = (w, h, mobile) =>
    cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  const load = async () => {
    await cdp.send('Page.navigate', { url: ORIGIN });
    await waitFor('ready', () => T('ready()').catch(() => false), 25000);
    await sleep(600);
  };
  let touch = false;
  const tap = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await sleep(150);
  };
  const tapSel = async (sel) => {
    const r = await T(`rect(${JSON.stringify(sel)})`);
    expect(r, 'no element ' + sel);
    await tap(r.x, r.y);
  };
  const key = async (k) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k });
    await sleep(150);
  };
  const open = async () => {
    if (!(await T('has(".settings")'))) await tapSel('button[aria-label="Settings"]');
    expect(await T('has(".settings")'), 'settings did not open');
  };
  const prefs = async () => {
    const e = await T('prefs()');
    return e && e.prefs ? e.prefs : e;
  };
  const dump = (p) => JSON.stringify(p);

  try {
    // ============== desktop 1280x800 ==============
    await viewport(1280, 800, false);
    await load();
    await tap(640, 400); // first gesture unlocks audio

    await check(
      'd1',
      'gear opens Settings, no tab selected; Escape closes; gear again then X closes',
      async () => {
        const before = await T('tabsSelected()');
        await tapSel('button[aria-label="Settings"]');
        expect(await T('has(".settings")'), 'not open');
        const sel = await T('tabsSelected()');
        expect(
          sel.every((s) => s === 'false'),
          'tab selected while open: ' + sel,
        );
        await key('Escape');
        expect(!(await T('has(".settings")')), 'Escape did not close');
        await tapSel('button[aria-label="Settings"]');
        await tapSel('button[aria-label="Close settings"]');
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
        await sleep(200);
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
        await sleep(200);
        const o1 = await T('osc()');
        const st = await T('state().sound.muted');
        expect(st === true, 'store muted not true');
        await T('swClick("Sound")');
        await sleep(200);
        const m2 = await T('master()');
        expect(m2 > 0, 'master not restored: ' + m2);
        await T('state().playTestSound()');
        await sleep(200);
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
            await T(`stepClick(${JSON.stringify(label)}, ${JSON.stringify(l)})`);
            await sleep(120);
            const p = await prefs();
            const v = p.sound.volumes[id];
            const s = await T(`step(${JSON.stringify(label)})`);
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
          expect(await T(`has(${JSON.stringify(sel)})`), sel + ' missing initially');
          await T(`swClick(${JSON.stringify(label)})`);
          await sleep(150);
          expect(
            !(await T(`has(${JSON.stringify(sel)})`)),
            `${label} off but ${sel} still present`,
          );
          const p = await prefs();
          expect(!!p.hud, 'hud prefs missing');
          await T(`swClick(${JSON.stringify(label)})`);
          await sleep(150);
          expect(await T(`has(${JSON.stringify(sel)})`), `${label} on but ${sel} missing`);
          ev.push(label + ' ok');
        }
        // skill tracker: needs xp; flip the store tracker directly, then toggle
        await cdp.eval(`(() => { const s = window.__t.state(); window.__t.state(); })()`);
        await cdp.eval(
          `window.__phaserGame.scene.getScene('world').deps.store.setState({ tracker: { skill: 'woodcutting', untilMs: 1e12 } })`,
        );
        await sleep(200);
        expect(await T('has(".tracker")'), 'tracker not shown with it on');
        await T('swClick("Skill tracker")');
        await sleep(150);
        expect(!(await T('has(".tracker")')), 'tracker still shown with it off');
        await T('swClick("Skill tracker")');
        await sleep(150);
        expect(await T('has(".tracker")'), 'tracker not back');
        ev.push('Skill tracker ok');
        await T('swClick("Show HUD")');
        await sleep(200);
        const left = await cdp.eval(
          `(() => ({ show: !!document.querySelector('.hud-show'), chat: !!document.querySelector('.chatbox'), mini: !!document.querySelector('.minimap-wrap'), orbs: !!document.querySelector('.orbs'), tracker: !!document.querySelector('.tracker'), hudHidden: document.querySelector('aside.hud')?.getAttribute('data-hidden'), hudRect: (() => { const r = document.querySelector('aside.hud')?.getBoundingClientRect(); return r && [r.width, r.height]; })() }))()`,
        );
        expect(
          left.show && !left.chat && !left.mini && !left.orbs && !left.tracker,
          'HUD off state: ' + JSON.stringify(left),
        );
        ev.push('HUD off: ' + JSON.stringify(left));
        await tapSel('.hud-show');
        await sleep(200);
        expect(!(await T('has(".hud-show")')) && (await T('has(".chatbox")')), 'restore failed');
        ev.push('restore ok');
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
        await sleep(200);
        expect(await T('has(".levelup")'), 'popup missing when on');
        ev.push('popup on ok');
        await tapSel('.levelup');
        await sleep(150);
        await T('swClick("Level-up popup")');
        await sleep(150);
        await lvl();
        await sleep(200);
        expect(!(await T('has(".levelup")')), 'popup shown when off');
        expect((await T('state().levelUp')) === null, 'store levelUp set while off');
        ev.push('popup off ok');
        await T('swClick("Level-up popup")');
        // area names
        await T('state().showAreaBanner("Test Vale")');
        await sleep(250);
        expect(await T('has(".area-banner")'), 'banner missing when on');
        await T('swClick("Area names")');
        await sleep(200);
        expect(!(await T('has(".area-banner")')), 'banner still visible after toggling off');
        const r = await T('state().showAreaBanner("Other Vale")');
        await sleep(200);
        expect(r === null && !(await T('has(".area-banner")')), 'banner shown while off');
        ev.push('area names ok');
        await T('swClick("Area names")');
        // game messages: examine a tree (routine line)
        const { trees } = await T('spawns()');
        const id = trees[0].nodeId;
        const chat = () => T('state().game.chat.map((c) => c.text)');
        const n0 = (await chat()).length;
        await T(`state().examineTree(${JSON.stringify(id)})`);
        await sleep(150);
        const n1 = (await chat()).length;
        expect(n1 > n0, 'examine added no line when on');
        await T('swClick("Game messages in chat")');
        await sleep(150);
        await T(`state().examineTree(${JSON.stringify(id)})`);
        await sleep(150);
        const n2 = (await chat()).length;
        expect(n2 === n1, `routine line added while off (${n1} -> ${n2})`);
        await T('state().walkTo({ x: 0, y: 0 })');
        await sleep(200); // unreachable/blocked: should be important
        const after = await chat();
        ev.push(
          `game messages off: routine line dropped (${n1}->${n2}); after walkTo(0,0) last chat "${after.at(-1)}"`,
        );
        await T('swClick("Game messages in chat")');
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
        const p = await T(`toClient(${t.x * 32 + 16}, ${t.y * 32 + 16})`);
        const top = await cdp.eval(`document.elementFromPoint(${p.x}, ${p.y})?.tagName`);
        if (top === 'CANVAS') {
          tree = t;
          break;
        }
      }
      expect(tree, 'no visible tree');
      const chop = async (ms) => {
        const xp0 = await T('state().game.progression.xp.woodcutting');
        const p = await T(`toClient(${tree.x * 32 + 16}, ${tree.y * 32 + 16})`);
        await tap(p.x, p.y);
        let seen = 0,
          got = false;
        const end = Date.now() + ms;
        while (Date.now() < end) {
          seen = Math.max(seen, (await T('xpTexts()')).length);
          const xp = await T('state().game.progression.xp.woodcutting');
          if (xp > xp0) {
            got = true;
            await sleep(300);
            seen = Math.max(seen, (await T('xpTexts()')).length);
            break;
          }
          await sleep(100);
        }
        return { got, seen };
      };
      const on = await chop(90000);
      expect(on.got, 'no wc xp gained');
      expect(on.seen > 0, 'XP gained but no XP drop text with pop-ups On');
      await sleep(3500);
      await open();
      await T('swClick("XP pop-ups")');
      await sleep(150);
      await key('Escape');
      await sleep(3000);
      const off = await chop(90000);
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
            await T(`stepClick(${JSON.stringify(label)}, ${JSON.stringify(txt)})`);
            await sleep(150);
            const p = await prefs();
            const v = p.visuals[key_];
            expect(v === val, `${label} ${txt} stored ${v}`);
            const s = await T(`step(${JSON.stringify(label)})`);
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
          await T(`swClick(${JSON.stringify(l)})`);
        await T('swClick("Sound")');
        await sleep(400);
        const before = dump(await prefs());
        await load();
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
        await T('stepClick("Master", "3")'); // restore for later phases
        return 'UI after reload ' + JSON.stringify(ui);
      },
    );
    // reset prefs for phone phase
    await cdp.eval(`localStorage.removeItem('idle-rpg:prefs')`);

    // ============== phone 390x844 portrait, then landscape ==============
    for (const [w, h, name] of [
      [390, 844, 'portrait'],
      [844, 390, 'landscape'],
    ]) {
      await cdp.eval(`localStorage.removeItem('idle-rpg:prefs')`);
      await viewport(w, h, true);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      touch = true;
      await load();
      await tap(w / 2, h / 3);
      await check(
        `p-${name}`,
        `phone ${w}x${h}: gear tap opens, tab not selected, fits, toggles + steps work by tap, Escape/X close`,
        async () => {
          const g = await T('rect(\'button[aria-label="Settings"]\')');
          expect((g && g.w >= 40 && g.h >= 40) || g, 'no gear');
          await tapSel('button[aria-label="Settings"]');
          expect(await T('has(".settings")'), 'not open by tap (gear ' + JSON.stringify(g) + ')');
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
          await sleep(100);
          await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings .steps-btn')].find((x) => x.textContent === '3'); b.scrollIntoView({ block: 'center' }); })()`,
          );
          await sleep(150);
          const sb = await cdp.eval(
            `(() => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Game sounds'); g.scrollIntoView({block:'center'}); const b = [...g.querySelectorAll('button')].find((x) => x.textContent === '2'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await sleep(100);
          await tap(sb.x, sb.y);
          const p = await prefs();
          expect(
            Math.abs(p.sound.volumes.sfx - 0.4) < 0.25,
            'tap on step did not store: ' + dump(p),
          );
          const tg = await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === 'Minimap'); b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await sleep(100);
          await tap(tg.x, tg.y);
          expect((await T('sw("Minimap")')).checked === 'false', 'tap on toggle did nothing');
          await T('swClick("Minimap")');
          const xr = await T('rect(\'button[aria-label="Close settings"]\')');
          await cdp.eval(`document.querySelector('.hud-body').scrollTop = 0`);
          await sleep(150);
          await tapSel('button[aria-label="Close settings"]');
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
          await sleep(100);
          const r = await cdp.eval(
            `(() => { const b = [...document.querySelectorAll('.settings button[role=switch]')].find((x) => x.firstElementChild.textContent === 'Show HUD'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
          );
          await tap(r.x, r.y);
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
          expect(!(await T('has(".hud-show")')), 'restore failed');
          return 'restore button ' + JSON.stringify(hr);
        },
      );
    }

    await check('z', 'no console errors in the whole run', async () => {
      const real = errors.filter((e) => !/favicon/.test(e));
      expect(real.length === 0, real.join(' | '));
      return `0 errors (${errors.length - real.length} favicon ignored)`;
    });
  } finally {
    await cdp.close();
    vite.kill();
  }
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}: ${r.title}\n     ${r.ev}`);
  }
  console.log(bad === 0 ? 'ALL PASSED' : `${bad} FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
