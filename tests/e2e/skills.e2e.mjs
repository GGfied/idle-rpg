/* global fetch, console */
// Skills grid + combat level e2e (HUD only; no world pixel positions). Own vite on :5186 (never 5173),
// fresh headless Chrome profile, real mouse/touch taps. Expected values come from core/progression
// (imported in-page through vite) plus a few hand-computed OSRS values.
// Run: node tests/e2e/skills.e2e.mjs   Exit 0 = all checks passed.
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { killChild, killTracked, launchChrome, sleep, spawnTracked } from './cdp.mjs';

setTimeout(() => {
  killTracked();
  process.exit(2);
}, 6 * 60e3).unref();

const PORT = Number(process.env.E2E_PORT ?? 5186);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};

async function startVite() {
  const proc = spawnTracked(
    resolve(ROOT, 'node_modules/.bin/vite'),
    [
      '--config',
      resolve(ROOT, 'tests/e2e/vite.frozen.config.mjs'),
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
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
  killChild(proc);
  throw new Error('vite did not start');
}

const PAGE = `(() => {
  const H = () => window.__idleRpg;
  window.__t = {
    ready: () => { try { return !!(H() && H().store.getState().game); } catch { return false; } },
    st: () => H().store.getState(),
    rectOf: (sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === text); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    // Set absolute levels (xp = xpForLevel) through the store, as a precondition.
    setLevels: async (levels) => {
      const P = await import('/src/core/progression/index.ts');
      const s = H().store, g = s.getState().game;
      const xp = { ...g.progression.xp };
      for (const [k, v] of Object.entries(levels)) xp[k] = P.xpForLevel(v);
      s.setState({ game: { ...g, progression: { ...g.progression, xp } } });
    },
    // Expected values from core/progression for the CURRENT store state.
    expected: async () => {
      const P = await import('/src/core/progression/index.ts');
      const p = H().store.getState().game.progression;
      return {
        total: P.totalLevel(p), combat: P.combatLevel(p),
        skills: P.SKILLS.map((k) => ({ id: k.id, name: k.name, color: k.color, level: P.levelForXp(p.xp[k.id]), xp: p.xp[k.id], next: P.xpToNextLevel(p.xp[k.id]) })),
      };
    },
    hex2rgb: (h) => { const n = parseInt(h.slice(1), 16); return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')'; },
    grid: async () => {
      const cells = [...document.querySelectorAll('.skill-cell')];
      const imgs = cells.map((c) => c.querySelector('img.skill-icon'));
      await Promise.all(imgs.filter(Boolean).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 3000); })));
      const nums = (t) => { const m = /Total level:\\s*(\\d+)[\\s\\S]*Combat level:\\s*(\\d+)/.exec(t || ''); return m ? [Number(m[1]), Number(m[2])] : null; };
      const tot = nums(document.querySelector('.skill-totals')?.textContent);
      return {
        total: tot && tot[0], combat: tot && tot[1],
        cells: cells.map((c, i) => { const r = c.getBoundingClientRect(); const b = c.querySelector('[role=progressbar]');
          return { label: c.getAttribute('aria-label'), name: c.querySelector('.skill-name')?.textContent, level: Number(c.querySelector('.skill-level').textContent),
            iconOk: !!imgs[i] && imgs[i].naturalWidth > 0, border: getComputedStyle(c).borderLeftColor, w: r.width, h: r.height, bar: b && Number(b.getAttribute('aria-valuenow')) }; }),
      };
    },
  };
})();`;

async function main() {
  let code = 1;
  let vite = null;
  let cdp = null;
  try {
    vite = await startVite();
    cdp = await launchChrome({ width: 1280, height: 800 });
    const errors = [];
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown')
        errors.push(
          'exception: ' +
            (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text),
        );
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        errors.push(
          'console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '),
        );
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    const T = (e) => cdp.eval(`window.__t.${e}`);
    const waitFor = async (what, pred, ms = 15000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout: ' + what);
        await sleep(100);
      }
    };
    let phase = 'desktop';
    let touch = false;
    // xfail = known bug id: a failure is reported as XFAIL (exit stays 0); a pass is XPASS (fails the run, remove the flag).
    const check = async (id, title, fn, xfail = null) => {
      try {
        const ev = (await fn()) ?? '';
        results.push({
          phase,
          id,
          title,
          ok: !xfail,
          ev: xfail ? `XPASS ${xfail} fixed? ${ev}` : ev,
        });
      } catch (e) {
        results.push({
          phase,
          id,
          title,
          ok: !!xfail,
          ev: (xfail ? `XFAIL ${xfail}: ` : '') + e.message,
        });
      }
    };
    const tap = async (x, y) => {
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased'])
          await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
      await sleep(200);
    };
    const viewport = async (w, h, mobile) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: mobile ? 2 : 1,
        mobile,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: mobile,
        maxTouchPoints: mobile ? 5 : 1,
      });
    };
    const load = async () => {
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await sleep(500);
      await cdp.send('Storage.clearDataForOrigin', {
        origin: ORIGIN.slice(0, -1),
        storageTypes: 'local_storage',
      });
      await cdp.send('Page.navigate', { url: ORIGIN });
      await waitFor('ready', () => T('ready()').catch(() => false), 25000);
      await sleep(800);
    };
    const openSkills = async () => {
      const r = await T(`rectOf('[role=tab]', 'Skills')`);
      expect(r, 'Skills tab not found');
      await tap(r.x, r.y);
      await waitFor('skills grid', () => cdp.eval('!!document.querySelector(".skill-grid")'), 4000);
      return r;
    };
    const cellRect = (name) => T(`rect('.skill-cell[aria-label^="${name}"]')`);
    const detail = () => cdp.eval(`document.querySelector('.skill-detail')?.innerText ?? null`);
    const verifyGrid = async (label) => {
      const [exp, got] = [await T('expected()'), await T('grid()')];
      expect(got.cells.length === 13 && exp.skills.length === 13, `${got.cells.length} cells`);
      for (let i = 0; i < 13; i++) {
        const e = exp.skills[i];
        const c = got.cells[i];
        expect(c.name === e.name, `cell ${i} name ${c.name} != ${e.name}`);
        expect(c.level === e.level, `${e.name} level ${c.level} != ${e.level}`);
        expect(c.label === `${e.name} level ${e.level}`, `${e.name} aria ${c.label}`);
        expect(c.iconOk, `${e.name} icon missing/zero width`);
        const want = await T(`hex2rgb('${e.color}')`);
        expect(c.border === want, `${e.name} colour ${c.border} != ${want}`);
      }
      expect(got.total === exp.total, `total ${got.total} != ${exp.total}`);
      expect(got.combat === exp.combat, `combat ${got.combat} != ${exp.combat}`);
      return `${label}: total ${got.total}, combat ${got.combat}, 13 cells with icon+colour+level`;
    };
    const setLv = async (levels) => {
      await T(`setLevels(${JSON.stringify(levels)})`);
      await sleep(250);
    };

    async function runPhase() {
      await load();
      await tap(640, 20);
      await check('k1', 'Skills tab opens by tap (aria-selected, grid visible)', async () => {
        await openSkills();
        const sel = await cdp.eval(
          `[...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Skills')?.getAttribute('aria-selected')`,
        );
        expect(sel === 'true', `aria-selected=${sel}`);
        return 'grid shown';
      });
      await check(
        'k2',
        'fresh save: 13 skills icon+colour+level; total 22, combat 3 (hand-computed + core)',
        async () => {
          const ev = await verifyGrid('fresh');
          const g = await T('grid()');
          expect(g.total === 22, `fresh total ${g.total} != 22 (12x1 + hitpoints 10)`);
          expect(g.combat === 3, `fresh combat ${g.combat} != 3`);
          return ev;
        },
      );
      await check('k3', 'tap targets >= 44px (skill cells, tabs)', async () => {
        const g = await T('grid()');
        const min = Math.min(...g.cells.map((c) => Math.min(c.w, c.h)));
        const tabs = await cdp.eval(
          `[...document.querySelectorAll('[role=tab]')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); })`,
        );
        const tmin = Math.min(...tabs);
        expect(min >= 44, `smallest skill cell ${min.toFixed(1)}px`);
        expect(tmin >= 44, `smallest tab ${tmin.toFixed(1)}px`);
        return `min cell ${min.toFixed(1)}px, min tab ${tmin.toFixed(1)}px`;
      });
      await check(
        'k4',
        'melee build: att60 str60 def40 hp50 pray20 -> combat 64 (hand) + core',
        async () => {
          await setLv({ attack: 60, strength: 60, defence: 40, hitpoints: 50, prayer: 20 });
          const ev = await verifyGrid('melee');
          const g = await T('grid()');
          expect(g.combat === 64, `combat ${g.combat} != 64`);
          expect(g.total === 60 + 60 + 40 + 50 + 20 + 8, `total ${g.total}`);
          return ev;
        },
      );
      await check(
        'k5',
        'ranged/magic dominate: ranged 99 magic 80 -> core combat; all 99 -> 126 / 1287',
        async () => {
          await setLv({
            attack: 1,
            strength: 1,
            ranged: 90,
            magic: 80,
            defence: 1,
            hitpoints: 10,
            prayer: 1,
          });
          const ev1 = await verifyGrid('ranged-dominant');
          const all = {};
          for (const k of [
            'attack',
            'strength',
            'defence',
            'hitpoints',
            'ranged',
            'prayer',
            'magic',
            'cooking',
            'woodcutting',
            'fishing',
            'mining',
            'smithing',
            'crafting',
          ])
            all[k] = 99;
          await setLv(all);
          const ev2 = await verifyGrid('maxed');
          const g = await T('grid()');
          expect(g.combat === 126, `maxed combat ${g.combat} != 126`);
          expect(g.total === 1287, `maxed total ${g.total} != 1287`);
          return `${ev1}; ${ev2}`;
        },
      );
      await check('k6', 'tap Woodcutting shows XP + next-level XP; tap again hides', async () => {
        await setLv({ woodcutting: 10 });
        const exp = (await T('expected()')).skills.find((s) => s.id === 'woodcutting');
        const r = await cellRect('Woodcutting');
        expect(r, 'no woodcutting cell');
        await tap(r.x, r.y);
        const d = await detail();
        expect(
          d && d.includes(`XP: ${Math.floor(exp.xp).toLocaleString()}`),
          'detail ' + JSON.stringify(d),
        );
        expect(
          d.includes(`Next level in: ${Math.ceil(exp.next).toLocaleString()} XP`),
          'next ' + JSON.stringify(d),
        );
        expect(d.includes('Level 10 / 99'), 'level line ' + JSON.stringify(d));
        const pressed = await cdp.eval(
          `document.querySelector('.skill-cell[aria-label^="Woodcutting"]').getAttribute('aria-pressed')`,
        );
        expect(pressed === 'true', 'aria-pressed ' + pressed);
        // The sheet scrolled to reveal the detail (SKILL-1), so re-measure the cell before tapping again.
        const r2 = await cellRect('Woodcutting');
        expect(r2, 'no woodcutting cell after scroll');
        await tap(r2.x, r2.y);
        expect(
          !(await cdp.eval('!!document.querySelector(".skill-detail")')),
          'detail did not hide',
        );
        return JSON.stringify(d);
      });
      await check(
        'k6v',
        'tapped skill detail is visible in the viewport without scrolling',
        async () => {
          const r = await cellRect('Woodcutting');
          await tap(r.x, r.y);
          const dr = await T(`rect('.skill-detail')`);
          const vp = await cdp.eval('({ w: innerWidth, h: innerHeight })');
          const ok = dr && dr.y - dr.h / 2 >= 0 && dr.y + dr.h / 2 <= vp.h;
          if (await detail()) {
            const r3 = await cellRect('Woodcutting');
            if (r3) await tap(r3.x, r3.y);
          }
          expect(ok, `detail rect ${JSON.stringify(dr)} vs viewport h ${vp.h}`);
          return `detail at y=${Math.round(dr.y)} within ${vp.h}`;
        },
      );
      await check(
        'k7',
        'switching skill replaces detail; max level shows "Maximum level"',
        async () => {
          const a = await cellRect('Mining');
          await tap(a.x, a.y);
          const b = await cellRect('Fishing');
          await tap(b.x, b.y);
          const d = await detail();
          expect(
            d && d.startsWith('Fishing') && !d.includes('Mining'),
            'detail ' + JSON.stringify(d),
          );
          await setLv({ fishing: 99 });
          const d2 = await detail();
          expect(d2 && d2.includes('Maximum level'), 'max detail ' + JSON.stringify(d2));
          await tap(b.x, b.y);
          expect(!(await detail()), 'did not hide');
          return JSON.stringify(d2);
        },
      );
      await check(
        'k8',
        'real chop: Woodcutting XP updates cell, total, detail and tracker',
        async () => {
          await setLv({ woodcutting: 1, fishing: 1 });
          // Precondition via intents: stand near the starter trees, pick the nearest tree node.
          await cdp.eval(`(() => { const s = window.__idleRpg.store; const g = s.getState().game;
          s.setState({ game: { ...g, movement: { ...g.movement, position: { x: 17, y: 17 }, path: [] }, gathering: { ...g.gathering, session: null } } }); })()`);
          const pick =
            await cdp.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const s = window.__idleRpg.store; let best = null;
          for (const [id, t] of CONTENT.trees) { const d = Math.abs(t.x - 17) + Math.abs(t.y - 17); if (best === null || d < best.d) best = { id, d }; }
          s.getState().interactTree(best.id); const g = s.getState().game; return g.pendingInteraction || g.gathering.session ? best : null; })()`);
          expect(pick, 'no reachable tree node found');
          const before = await cdp.eval('window.__t.st().game.progression.xp.woodcutting');
          const totalBefore = (await T('grid()')).total;
          await waitFor(
            'woodcutting xp',
            async () =>
              (await cdp.eval('window.__t.st().game.progression.xp.woodcutting')) > before,
            45000,
          );
          await sleep(400);
          const xp = await cdp.eval('window.__t.st().game.progression.xp.woodcutting');
          const tracker = await cdp.eval(
            `document.querySelector('[aria-label="Woodcutting tracker"]')?.innerText ?? null`,
          );
          expect(tracker && /XP/.test(tracker), 'no tracker: ' + tracker);
          const shown = Number(/([\d,]+) XP/.exec(tracker)[1].replace(/,/g, ''));
          expect(shown === Math.floor(xp), `tracker "${tracker}" vs xp ${xp}`);
          const g = await T('grid()');
          const wc = g.cells.find((c) => c.name === 'Woodcutting');
          const exp = await T('expected()');
          expect(
            wc.level === exp.skills.find((s) => s.id === 'woodcutting').level,
            'cell level stale',
          );
          expect(wc.bar > 0, `cell progress bar ${wc.bar}`);
          expect(g.total === exp.total && g.total >= totalBefore, `total ${g.total}`);
          const r = await cellRect('Woodcutting');
          await tap(r.x, r.y);
          const d = await detail();
          expect(
            d && d.includes(`XP: ${Math.floor(xp).toLocaleString()}`),
            `detail ${JSON.stringify(d)} vs ${xp}`,
          );
          await tap(r.x, r.y);
          return `tree ${pick.id}; xp ${before}->${xp}; tracker "${tracker.replace(/\n/g, ' | ')}"; cell bar ${wc.bar}`;
        },
      );
    }

    await viewport(1280, 800, false);
    await runPhase();
    phase = 'phone';
    touch = true;
    await viewport(390, 844, true);
    await runPhase();
    await check('k9', 'no console errors / exceptions', async () => {
      expect(errors.length === 0, errors.slice(0, 5).join(' || '));
      return '0 errors';
    });
    for (const r of results)
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.phase}] ${r.id} ${r.title}\n     ${r.ev}`);
    const fails = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - fails}/${results.length} checks passed`);
    code = fails ? 1 : 0;
  } catch (e) {
    console.error('script error:', e);
    code = 2;
  } finally {
    try {
      cdp?.close?.();
    } catch {
      /* ignore */
    }
    if (vite) killChild(vite);
    killTracked();
  }
  process.exit(code);
}
main();
