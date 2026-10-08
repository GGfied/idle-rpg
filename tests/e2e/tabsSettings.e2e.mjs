// Tapping a tab while Settings is open closes Settings and shows that tab. REAL input only
// (mouse on desktop, touch on phone). Shots: SHOTS_DIR=<dir>.
// Fast base: runParallel desktop + phone (HUD DOM only: renderer does not matter), wait on the HUD state instead of
// fixed 250 ms sleeps, budget 60 s. Run: node tests/e2e/tabsSettings.e2e.mjs
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9180; // combos use 9180..9181
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const PANEL = { Skills: 'skills', Inventory: 'inv' };

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const q = (js) => g.eval(js);
    const phone = vp === 'phone';
    const state = async () =>
      JSON.parse(
        await q(`JSON.stringify((() => { const h = document.querySelector('.hud');
          const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
          return { settings: h.dataset.settings, folded: h.dataset.folded,
            sel: [...document.querySelectorAll('[role=tab]')].filter(b=>b.getAttribute('aria-selected')==='true').map(b=>b.textContent),
            skills: vis('.skill-grid'), inv: vis('[data-slot-index="0"]'), settingsPanel: !!document.querySelector('[role=radiogroup], .settings') && h.dataset.settings === 'true' }; })())`),
      );
    /** Wait (up to 3 s) until pred(state) holds; never throws: the caller's expect() reports the actual state. */
    const until = (pred, label) =>
      g.waitFor(async () => pred(await state()), { label, timeoutMs: 3000 }).catch(() => {});
    /** Tap a tab, then wait for the outcome every caller expects: Settings closed, that tab selected, its panel shown. */
    const tapTab = async (label) => {
      await q(
        `[...document.querySelectorAll('[role=tab]')].forEach(b=>b.textContent==='${label}'?b.setAttribute('data-qa','t'):b.removeAttribute('data-qa'))`,
      );
      await g.tapSelector('[data-qa="t"]');
      await until(
        (o) =>
          o.settings === 'false' &&
          o.sel[0] === label &&
          o[PANEL[label]] &&
          (!phone || o.folded === 'false'),
        `${label} shown`,
      );
    };
    const fold = async (want) => {
      await g.tapSelector('.sheet-fold');
      await until((o) => o.folded === want, `folded=${want}`);
    };
    const openSettings = async () => {
      if (phone && (await q(`document.querySelector('.hud').dataset.folded`)) === 'true')
        await fold('false');
      await g.tapSelector('[aria-label="Settings"]');
      await until((o) => o.settings === 'true', 'settings open');
      expect((await state()).settings === 'true', 'settings did not open');
    };

    await check(
      `gear-skills-${vp}`,
      'gear -> tap Skills: Settings closed, Skills shown',
      async () => {
        await openSettings();
        await g.screenshot(`tabs-${vp}-1-settings`);
        await tapTab('Skills');
        await g.screenshot(`tabs-${vp}-2-skills`);
        const o = await state();
        expect(
          o.settings === 'false' && o.sel.length === 1 && o.sel[0] === 'Skills' && o.skills,
          JSON.stringify(o),
        );
        return JSON.stringify(o);
      },
    );

    await check(
      `gear-current-${vp}`,
      'gear -> tap CURRENT tab: Settings closed, panel visible (not toggled shut)',
      async () => {
        // current tab is Skills (from the previous check); open Settings then re-tap Skills
        await openSettings();
        await tapTab('Skills');
        await g.screenshot(`tabs-${vp}-3-retap-skills`);
        const o = await state();
        expect(o.settings === 'false' && o.sel[0] === 'Skills' && o.skills, JSON.stringify(o));
        // and the other tab too: switch to Inventory, open Settings, re-tap Inventory
        await tapTab('Inventory');
        await openSettings();
        await tapTab('Inventory');
        await g.screenshot(`tabs-${vp}-4-retap-inventory`);
        const p = await state();
        expect(p.settings === 'false' && p.sel[0] === 'Inventory' && p.inv, JSON.stringify(p));
        return JSON.stringify([o, p]);
      },
    );

    if (phone)
      await check(
        'folded-phone',
        'sheet folded while Settings open -> tap a tab unfolds with that panel',
        async () => {
          await openSettings();
          await fold('true');
          const f = await state();
          expect(f.folded === 'true', 'sheet did not fold: ' + JSON.stringify(f));
          await g.screenshot('tabs-phone-5-folded');
          await tapTab('Skills');
          await g.screenshot('tabs-phone-6-unfolded-skills');
          const o = await state();
          expect(
            o.settings === 'false' && o.folded === 'false' && o.sel[0] === 'Skills' && o.skills,
            JSON.stringify(o),
          );
          // plain folded (no Settings): tap Inventory unfolds with inventory
          await fold('true');
          expect((await state()).folded === 'true', 'second fold failed');
          await tapTab('Inventory');
          const p = await state();
          expect(p.folded === 'false' && p.sel[0] === 'Inventory' && p.inv, JSON.stringify(p));
          return JSON.stringify([o, p]);
        },
      );
  }),
);
