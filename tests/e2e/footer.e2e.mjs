/* global fetch, console */
// QA slice: Settings panel version footer ("Version x.y.z" + "What's new" link), real mouse/touch input.
// Own dev server on 5183 (never 5173). Run: node tests/e2e/footer.e2e.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, killChild } from './cdp.mjs';

const PORT = 5183;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const URL_EXPECTED = 'https://github.com/GGfied/idle-rpg/blob/main/CHANGELOG-2026.md';
const results = [];
let profile = '';
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(id, fn) {
  try {
    results.push({ id: `${profile}:${id}`, ok: true, evidence: (await fn()) ?? '' });
  } catch (e) {
    results.push({ id: `${profile}:${id}`, ok: false, evidence: e.message });
  }
}

async function startVite() {
  const proc = spawn(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', detached: true },
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

const PROFILES = [
  { name: 'desktop1280x800', w: 1280, h: 800, touch: false },
  { name: 'phone390x844', w: 390, h: 844, touch: true },
  { name: 'landscape844x390', w: 844, h: 390, touch: true },
];

async function main() {
  const vite = await startVite();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  const errors = [];
  const created = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        `exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`,
      );
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    else if (m.method === 'Target.targetCreated') {
      const t = m.params.targetInfo;
      if (t.type === 'page' && t.openerId) {
        created.push(t.url);
        // never load GitHub: close the new tab at once
        cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
      }
    }
  });
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const dom = (js) => cdp.eval(`(() => { ${js} })()`);
    const tap = async (x, y, touch) => {
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
      }
    };
    const rectOf = (sel) =>
      dom(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
        const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };`);

    for (const p of PROFILES) {
      profile = p.name;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: p.w,
        height: p.h,
        deviceScaleFactor: 1,
        mobile: p.touch,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: p.touch });
      if (profile !== PROFILES[0].name) await dom(`localStorage.clear();`);
      await cdp.send('Page.navigate', { url: ORIGIN });
      await sleep(2500);
      let btn = null;
      for (let i = 0; i < 40 && !btn; i++) {
        btn = await rectOf('button[aria-label="Settings"]');
        if (!btn) await sleep(250);
      }
      await check('open-settings', async () => {
        expect(btn, 'Settings button not in DOM');
        const hit =
          await dom(`const e = document.elementFromPoint(${btn.x + btn.w / 2}, ${btn.y + btn.h / 2});
          return e && (e.closest('button')?.getAttribute('aria-label') || e.tagName);`);
        expect(
          hit === 'Settings',
          `Settings button covered/offscreen: rect ${JSON.stringify(btn)}, hit ${hit}`,
        );
        await tap(btn.x + btn.w / 2, btn.y + btn.h / 2, p.touch);
        await sleep(400);
        expect(await rectOf('.settings-footer'), 'footer not in DOM after opening Settings');
        return `btn ${JSON.stringify(btn)}`;
      });
      // scroll to bottom: find the scrollable ancestor and scroll it (precondition)
      await dom(`const f = document.querySelector('.settings-footer'); if (!f) return;
        let e = f.parentElement; while (e && e !== document.body) {
          if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
          e = e.parentElement; }`);
      await sleep(300);
      await check('version-text', async () => {
        const t = await dom(
          `return document.querySelector('.settings-version')?.textContent ?? null;`,
        );
        expect(t === `Version ${VERSION}`, `text ${JSON.stringify(t)} != "Version ${VERSION}"`);
        return t;
      });
      await check('link-attrs', async () => {
        const a = await dom(`const a = document.querySelector('.settings-footer a');
          return a && { href: a.href, target: a.target, rel: a.rel, text: a.textContent };`);
        expect(a, 'no link');
        expect(
          a.href === URL_EXPECTED &&
            a.target === '_blank' &&
            /noopener/.test(a.rel) &&
            /noreferrer/.test(a.rel),
          JSON.stringify(a),
        );
        return JSON.stringify(a);
      });
      await check('link-box-in-viewport', async () => {
        const r = await rectOf('.settings-footer a');
        expect(r, 'no link');
        const vp = await dom(`return { w: innerWidth, h: innerHeight };`);
        expect(r.h >= 44, `height ${r.h} < 44`);
        expect(
          r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h,
          `rect ${JSON.stringify(r)} outside viewport ${JSON.stringify(vp)}`,
        );
        return `rect ${JSON.stringify(r)} viewport ${JSON.stringify(vp)}`;
      });
      await check('not-overlapped', async () => {
        const r = await rectOf('.settings-footer a');
        expect(r, 'no link');
        const pts = [
          [0.5, 0.5],
          [0.15, 0.2],
          [0.85, 0.2],
          [0.15, 0.8],
          [0.85, 0.8],
        ];
        const bad = [];
        for (const [fx, fy] of pts) {
          const x = r.x + r.w * fx,
            y = r.y + r.h * fy;
          const ok = await dom(
            `const e = document.elementFromPoint(${x}, ${y}); return !!e && !!e.closest('.settings-footer a');`,
          );
          if (!ok)
            bad.push(
              await dom(
                `const e = document.elementFromPoint(${x}, ${y}); return e && (e.className || e.tagName);`,
              ),
            );
        }
        const f = await rectOf('.settings-footer');
        const fh = await dom(
          `const e = document.elementFromPoint(${f.x + 8}, ${f.y + f.h / 2}); return !!e && !!e.closest('.settings-footer');`,
        );
        expect(
          bad.length === 0 && fh,
          `covered at ${bad.length}/5 points by ${JSON.stringify(bad)}; footer left edge hit ok=${fh}`,
        );
        return 'link hit at 5 points, footer hit ok';
      });
      await check('click-opens-new-target', async () => {
        const r = await rectOf('.settings-footer a');
        expect(r, 'no link');
        created.length = 0;
        await tap(r.x + r.w / 2, r.y + r.h / 2, p.touch);
        for (let i = 0; i < 20 && created.length === 0; i++) await sleep(150);
        expect(created.length > 0, 'no Target.targetCreated after tap');
        expect(
          created.some((u) => u.startsWith('https://github.com/GGfied/idle-rpg/')) ||
            created.some((u) => u === URL_EXPECTED || u === '' || u === 'about:blank'),
          `unexpected urls ${JSON.stringify(created)}`,
        );
        return `targets ${JSON.stringify(created)}`;
      });
    }
    profile = 'all';
    await check('no-console-errors', async () => {
      expect(errors.length === 0, errors.slice(0, 5).join(' | '));
      return '0 errors';
    });
  } finally {
    await cdp.close();
    killChild(vite);
  }
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.evidence}`);
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
