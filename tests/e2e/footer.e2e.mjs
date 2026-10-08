// QA slice: Settings panel version footer ("Version x.y.z" + "What's new" link), real mouse/touch input.
// Fast base: runParallel desktop + phone + landscape (one child each), wait-on-state, budget 60 s.
// Run: node tests/e2e/footer.e2e.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9154;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'], // DOM-only footer: renderer does not matter
  budgetMs: BUDGET_MS,
});
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const URL_EXPECTED = 'https://github.com/GGfied/idle-rpg/blob/main/CHANGELOG-2026.md';
const J = JSON.stringify;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const { cdp } = g;
    const created = [];
    cdp.on((m) => {
      // Log-domain errors (failed resource loads etc.) count as console errors, as before.
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
        g.errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
      else if (m.method === 'Target.targetCreated') {
        const t = m.params.targetInfo;
        if (t.type === 'page' && t.openerId) {
          created.push(t.url);
          // never load GitHub: close the new tab at once
          cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
        }
      }
    });
    await cdp.send('Log.enable');
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const dom = (js) => g.eval(`(() => { ${js} })()`);
    const rectOf = (sel) =>
      dom(`const e = document.querySelector(${J(sel)}); if (!e) return null;
        const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };`);
    const footer = () => g.waitFor(() => rectOf('.settings-footer'), { label: 'settings footer' });
    // check() closes overlays first (incl. Settings): later checks reopen it via the store (precondition only;
    // the real-input open is asserted in open-settings) and scroll the footer into view.
    const reopen = async () => {
      await g.eval(`window.__idleRpg.store.setState({ settingsOpen: true }), 0`);
      await footer();
      await dom(`const f = document.querySelector('.settings-footer'); if (!f) return;
        let e = f.parentElement; while (e && e !== document.body) {
          if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
          e = e.parentElement; }`);
      // wait until the link box is stable after the scroll
      let prev = null;
      return g.waitFor(
        async () => {
          const r = await rectOf('.settings-footer a');
          const same = r && prev && r.y === prev.y;
          prev = r;
          return same ? r : null;
        },
        { label: 'footer link still after scroll', intervalMs: 60 },
      );
    };

    await check(
      'open-settings',
      `${vp}: Settings button opens the panel with the footer`,
      async () => {
        const btn = await g.waitFor(() => rectOf('button[aria-label="Settings"]'), {
          label: 'Settings button',
          timeoutMs: 10000,
        });
        const hit =
          await dom(`const e = document.elementFromPoint(${btn.x + btn.w / 2}, ${btn.y + btn.h / 2});
          return e && (e.closest('button')?.getAttribute('aria-label') || e.tagName);`);
        expect(hit === 'Settings', `Settings button covered/offscreen: rect ${J(btn)}, hit ${hit}`);
        await g.tap(btn.x + btn.w / 2, btn.y + btn.h / 2);
        expect(
          await g.waitFor(() => rectOf('.settings-footer'), { timeoutMs: 3000, label: 'footer' }),
          'footer not in DOM after opening Settings',
        );
        return `btn ${J(btn)}`;
      },
    );
    await check('version-text', 'footer shows "Version x.y.z" from package.json', async () => {
      await reopen();
      const t = await dom(
        `return document.querySelector('.settings-version')?.textContent ?? null;`,
      );
      expect(t === `Version ${VERSION}`, `text ${J(t)} != "Version ${VERSION}"`);
      return t;
    });
    await check('link-attrs', "What's new link: href, _blank, noopener noreferrer", async () => {
      await reopen();
      const a = await dom(`const a = document.querySelector('.settings-footer a');
          return a && { href: a.href, target: a.target, rel: a.rel, text: a.textContent };`);
      expect(a, 'no link');
      expect(
        a.href === URL_EXPECTED &&
          a.target === '_blank' &&
          /noopener/.test(a.rel) &&
          /noreferrer/.test(a.rel),
        J(a),
      );
      return J(a);
    });
    await check('link-box-in-viewport', 'link >= 44 px tall and inside the viewport', async () => {
      const r = await reopen();
      const v = await dom(`return { w: innerWidth, h: innerHeight };`);
      expect(r.h >= 44, `height ${r.h} < 44`);
      expect(
        r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w && r.y + r.h <= v.h,
        `rect ${J(r)} outside viewport ${J(v)}`,
      );
      return `rect ${J(r)} viewport ${J(v)}`;
    });
    await check('not-overlapped', 'link is the top element at 5 points; footer hit', async () => {
      const r = await reopen();
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
        `covered at ${bad.length}/5 points by ${J(bad)}; footer left edge hit ok=${fh}`,
      );
      return 'link hit at 5 points, footer hit ok';
    });
    await check(
      'click-opens-new-target',
      'tapping the link opens a new tab (closed at once)',
      async () => {
        const r = await reopen();
        created.length = 0;
        await g.tap(r.x + r.w / 2, r.y + r.h / 2);
        await g
          .waitFor(() => created.length > 0, { timeoutMs: 3000, label: 'new target' })
          .catch(() => {});
        expect(created.length > 0, 'no Target.targetCreated after tap');
        expect(
          created.some((u) => u.startsWith('https://github.com/GGfied/idle-rpg/')) ||
            created.some((u) => u === URL_EXPECTED || u === '' || u === 'about:blank'),
          `unexpected urls ${J(created)}`,
        );
        return `targets ${J(created)}`;
      },
    );
  }),
);
