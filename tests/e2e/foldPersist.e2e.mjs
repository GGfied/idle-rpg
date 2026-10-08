// hud fold prefs (hud.sheetFold / hud.chatFold) survive a reload. Run: node tests/e2e/foldPersist.e2e.mjs (ports 9425-9426,
// E2E_PORT overrides; fast base: parallel phone + desktop children, ?tickMs=60, wait-on-state instead of sleeps, budget
// 60 s). The phone child stores the prefs with real taps (f1-f3); the desktop child (f4) gets "stored collapsed" as a
// precondition through the store's setPref (the same prefs store the HUD's fold buttons write).
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9425;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['phone', 'desktop'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const prefs = (g) =>
  g.eval(`(() => { const r = localStorage.getItem('idle-rpg:prefs'); if (!r) return null;
    const h = JSON.parse(r); const p = h.prefs ?? h; return { s: p.hud?.sheetFold, c: p.hud?.chatFold }; })()`);
const ui = (g) =>
  g.eval(
    `({ sheet: document.querySelector('.hud')?.dataset.folded, chat: document.querySelector('.chatbox')?.dataset.min })`,
  );
const box = (g, sel) =>
  g.eval(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height }; })()`,
  );
/** Reload the page (keeps localStorage) and wait until the game and the HUD fold state are rendered (replaces 900 ms). */
const reload = async (g) => {
  await g.cdp.send('Page.reload');
  await g.waitFor(() => g.page('ready()').catch(() => false), { timeoutMs: 25000, label: 'ready' });
  await g.waitFor(
    async () => {
      const u = await ui(g);
      return u.sheet !== undefined && u.chat !== undefined;
    },
    { label: 'HUD fold state rendered', timeoutMs: 5000 },
  );
};
/** Real tap on `sel`, then wait until ui()[key] === want (replaces a fixed 500 ms); the check's expect reports a miss. */
const tapSel = async (g, sel, key, want) => {
  const b = await box(g, sel);
  expect(b, `missing ${sel}`);
  await g.tap(b.x, b.y);
  await g
    .waitFor(async () => (await ui(g))[key] === want, { label: `${key}=${want}`, timeoutMs: 4000 })
    .catch(() => {});
};
/** Wait until both fold prefs are stored as `want` (replaces a fixed 600 ms before the reload). */
const prefsStored = (g, want) =>
  g
    .waitFor(
      async () => {
        const p = await prefs(g);
        return p?.s === want && p?.c === want;
      },
      { label: `prefs stored ${want}`, timeoutMs: 4000 },
    )
    .catch(() => {}); // the check's expect reports the stored prefs
const J = JSON.stringify;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  if (vp === 'phone') {
    await check('f1', 'phone fresh: sheet + chat collapsed (auto)', async () => {
      const u = await ui(g);
      expect(u.sheet === 'true' && u.chat === 'true', J(u));
      return J({ ui: u, prefs: await prefs(g) });
    });
    await check('f2', 'expand both, reload: still expanded, stored expanded', async () => {
      await tapSel(g, '.tabs [role=tab]', 'sheet', 'false');
      await tapSel(g, '.chat-toggle', 'chat', 'false');
      const u0 = await ui(g);
      expect(u0.sheet === 'false' && u0.chat === 'false', 'did not expand ' + J(u0));
      await prefsStored(g, 'expanded');
      await reload(g);
      const u = await ui(g);
      const p = await prefs(g);
      expect(
        u.sheet === 'false' && u.chat === 'false' && p?.s === 'expanded' && p?.c === 'expanded',
        J({ u, p }),
      );
      return J({ u, p });
    });
    await check('f3', 'collapse both, reload: still collapsed, stored collapsed', async () => {
      await tapSel(g, '.sheet-fold', 'sheet', 'true');
      await tapSel(g, '.chat-toggle', 'chat', 'true');
      const u0 = await ui(g);
      expect(u0.sheet === 'true' && u0.chat === 'true', 'did not collapse ' + J(u0));
      await prefsStored(g, 'collapsed');
      await reload(g);
      const u = await ui(g);
      const p = await prefs(g);
      expect(
        u.sheet === 'true' && u.chat === 'true' && p?.s === 'collapsed' && p?.c === 'collapsed',
        J({ u, p }),
      );
      return J({ u, p });
    });
  } else {
    await check('f4', 'desktop with stored collapsed: HUD still normal', async () => {
      // Precondition (the phone child proves the taps store it): both folds stored "collapsed", then reload.
      await g.store(`s.setPref({ hud: { sheetFold: 'collapsed', chatFold: 'collapsed' } })`);
      await prefsStored(g, 'collapsed');
      const stored = await prefs(g);
      expect(stored?.s === 'collapsed' && stored?.c === 'collapsed', 'precondition ' + J(stored));
      await reload(g);
      const r =
        await g.eval(`(() => { const h = document.querySelector('.hud'); const cs = getComputedStyle(h); const hr = h.getBoundingClientRect();
      const cb = document.querySelector('.chatbox')?.getBoundingClientRect();
      return { folded: h.dataset.folded, chatMin: document.querySelector('.chatbox')?.dataset.min, hudDisplay: cs.display, hud: [hr.width, hr.height],
        chat: cb && [cb.width, cb.height], slots: document.querySelectorAll('.hud .slot').length,
        sheetFold: getComputedStyle(document.querySelector('.sheet-fold')).display, chatToggle: getComputedStyle(document.querySelector('.chat-toggle')).display }; })()`);
      await g.screenshot('foldpersist-desktop');
      expect(
        r.hudDisplay !== 'none' && r.hud[1] > 100 && r.slots > 0 && r.chat && r.chat[1] > 30,
        J(r),
      );
      return J({ stored, ...r });
    });
  }
});
