/* global console */
// Skills grid + combat level e2e (HUD only; no world pixel positions). Fast base: runParallel desktop + phone
// children, ?tickMs=60, wait-on-state (no fixed sleeps), levels set through the store, budget 60 s.
// Expected values come from core/progression (imported in-page through vite) plus a few hand-computed OSRS values.
// Run: node tests/e2e/skills.e2e.mjs   Exit 0 = all checks passed.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9101; // C3 block 9101-9150 (children 9101, 9102)
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'], // HUD-only test: no world drawing asserted, canvas renderer adds nothing
  budgetMs: BUDGET_MS,
});

// Page helpers (installed after each load). rect() does NOT scroll, so k6v can assert "visible without scrolling".
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  window.__t = {
    st: () => H().store.getState(),
    rectOf: (sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === text); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
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
})()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g) => {
  await g.eval(PAGE);
  const T = (e) => g.eval(`window.__t.${e}`);
  const detail = () => g.eval(`document.querySelector('.skill-detail')?.innerText ?? null`);
  const cellRect = (name) => T(`rect('.skill-cell[aria-label^="${name}"]')`);
  const openSkills = async () => {
    const r = await T(`rectOf('[role=tab]', 'Skills')`);
    expect(r, 'Skills tab not found');
    await g.tap(r.x, r.y);
    await g.waitFor(() => g.eval('!!document.querySelector(".skill-grid")'), {
      timeoutMs: 4000,
      label: 'skills grid',
    });
  };
  // Set levels (precondition), then wait until the grid shows core's new totals (replaces a fixed 250 ms sleep).
  const setLv = async (levels) => {
    await g.setLevels(levels);
    await g.waitFor(
      async () => {
        const [e, got] = [await T('expected()'), await T('grid()')];
        return got.total === e.total && got.combat === e.combat;
      },
      { timeoutMs: 4000, label: 'grid totals updated' },
    );
  };
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
  const waitDetail = (pred, label) =>
    g.waitFor(
      async () => {
        const d = await detail();
        return pred(d) ? d || 'hidden' : null;
      },
      { timeoutMs: 4000, label },
    );

  await g.tap(640, 20);
  await check('k1', 'Skills tab opens by tap (aria-selected, grid visible)', async () => {
    await openSkills();
    const sel = await g.eval(
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
      const gr = await T('grid()');
      expect(gr.total === 22, `fresh total ${gr.total} != 22 (12x1 + hitpoints 10)`);
      expect(gr.combat === 3, `fresh combat ${gr.combat} != 3`);
      return ev;
    },
  );
  await check('k3', 'tap targets >= 44px (skill cells, tabs)', async () => {
    const gr = await T('grid()');
    const min = Math.min(...gr.cells.map((c) => Math.min(c.w, c.h)));
    const tabs = await g.eval(
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
      const gr = await T('grid()');
      expect(gr.combat === 64, `combat ${gr.combat} != 64`);
      expect(gr.total === 60 + 60 + 40 + 50 + 20 + 8, `total ${gr.total}`);
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
      const gr = await T('grid()');
      expect(gr.combat === 126, `maxed combat ${gr.combat} != 126`);
      expect(gr.total === 1287, `maxed total ${gr.total} != 1287`);
      return `${ev1}; ${ev2}`;
    },
  );
  await check('k6', 'tap Woodcutting shows XP + next-level XP; tap again hides', async () => {
    await setLv({ woodcutting: 10 });
    const exp = (await T('expected()')).skills.find((s) => s.id === 'woodcutting');
    const r = await cellRect('Woodcutting');
    expect(r, 'no woodcutting cell');
    await g.tap(r.x, r.y);
    const d = await waitDetail((x) => !!x, 'detail shown').catch(() => null);
    expect(
      d && d.includes(`XP: ${Math.floor(exp.xp).toLocaleString()}`),
      'detail ' + JSON.stringify(d),
    );
    expect(
      d.includes(`Next level in: ${Math.ceil(exp.next).toLocaleString()} XP`),
      'next ' + JSON.stringify(d),
    );
    expect(d.includes('Level 10 / 99'), 'level line ' + JSON.stringify(d));
    const pressed = await g.eval(
      `document.querySelector('.skill-cell[aria-label^="Woodcutting"]').getAttribute('aria-pressed')`,
    );
    expect(pressed === 'true', 'aria-pressed ' + pressed);
    // The sheet scrolled to reveal the detail (SKILL-1), so re-measure the cell (after the scroll) before tapping again.
    const r2 = await g.settleRect(`.skill-cell[aria-label^="Woodcutting"]`);
    expect(r2, 'no woodcutting cell after scroll');
    await g.tap(r2.x, r2.y);
    const hidden = await waitDetail((x) => !x, 'detail hidden').catch(() => false);
    expect(hidden, 'detail did not hide');
    return JSON.stringify(d);
  });
  await check(
    'k6v',
    'tapped skill detail is visible in the viewport without scrolling',
    async () => {
      const r = await cellRect('Woodcutting');
      await g.tap(r.x, r.y);
      await waitDetail((x) => !!x, 'detail shown').catch(() => null);
      // Wait for the reveal scroll (SKILL-1) to finish, then measure the detail without scrolling it into view.
      const dr = await g.settleRect('.skill-detail');
      const vp = await g.eval('({ w: innerWidth, h: innerHeight })');
      const ok = dr && dr.y - dr.h / 2 >= 0 && dr.y + dr.h / 2 <= vp.h;
      if (await detail()) {
        const r3 = await cellRect('Woodcutting');
        if (r3) await g.tap(r3.x, r3.y);
        await waitDetail((x) => !x, 'detail hidden').catch(() => false);
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
      await g.tap(a.x, a.y);
      await waitDetail((x) => !!x && x.startsWith('Mining'), 'mining detail').catch(() => null);
      const b = await g.settleRect('.skill-cell[aria-label^="Fishing"]');
      await g.tap(b.x, b.y);
      const d = await waitDetail((x) => !!x && x.startsWith('Fishing'), 'fishing detail').catch(
        () => detail(),
      );
      expect(d && d.startsWith('Fishing') && !d.includes('Mining'), 'detail ' + JSON.stringify(d));
      await g.setLevels({ fishing: 99 });
      const d2 = await waitDetail((x) => !!x && x.includes('Maximum level'), 'max detail').catch(
        () => detail(),
      );
      expect(d2 && d2.includes('Maximum level'), 'max detail ' + JSON.stringify(d2));
      const b2 = await g.settleRect('.skill-cell[aria-label^="Fishing"]');
      await g.tap(b2.x, b2.y);
      const hidden = await waitDetail((x) => !x, 'detail hidden').catch(() => false);
      expect(hidden, 'did not hide');
      return JSON.stringify(d2);
    },
  );
  await check(
    'k8',
    'real chop: Woodcutting XP updates cell, total, detail and tracker',
    async () => {
      await setLv({ woodcutting: 1, fishing: 1 });
      // Precondition: stand near the starter trees (teleport), pick the nearest tree node, start chopping by intent.
      await g.teleport(17, 17, { settleMs: 0 });
      const pick =
        await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const s = window.__idleRpg.store; let best = null;
          for (const [id, t] of CONTENT.trees) { const d = Math.abs(t.x - 17) + Math.abs(t.y - 17); if (best === null || d < best.d) best = { id, d }; }
          s.getState().interactTree(best.id); const g = s.getState().game; return g.pendingInteraction || g.gathering.session ? best : null; })()`);
      expect(pick, 'no reachable tree node found');
      const before = await g.state('progression.xp.woodcutting');
      const totalBefore = (await T('grid()')).total;
      await g.waitState('progression.xp.woodcutting', `v => v > ${before}`, {
        timeoutMs: 20000,
        label: 'woodcutting xp',
      });
      // Session over (no more XP can land), then the tracker must show exactly the stored XP.
      await g.waitState('', 'g => !g.gathering.session && !g.pendingInteraction', {
        timeoutMs: 20000,
        label: 'chop session ended',
      });
      const xp = await g.state('progression.xp.woodcutting');
      const tracker = await g
        .waitFor(
          async () => {
            const t = await g.eval(
              `document.querySelector('[aria-label="Woodcutting tracker"]')?.innerText ?? null`,
            );
            const m = t && /([\d,]+) XP/.exec(t);
            return m && Number(m[1].replace(/,/g, '')) === Math.floor(xp) ? t : null;
          },
          { timeoutMs: 4000, label: 'tracker shows xp' },
        )
        .catch(() =>
          g.eval(`document.querySelector('[aria-label="Woodcutting tracker"]')?.innerText ?? null`),
        );
      expect(tracker && /XP/.test(tracker), 'no tracker: ' + tracker);
      const shown = Number(/([\d,]+) XP/.exec(tracker)[1].replace(/,/g, ''));
      expect(shown === Math.floor(xp), `tracker "${tracker}" vs xp ${xp}`);
      const gr = await T('grid()');
      const wc = gr.cells.find((c) => c.name === 'Woodcutting');
      const exp = await T('expected()');
      expect(wc.level === exp.skills.find((s) => s.id === 'woodcutting').level, 'cell level stale');
      expect(wc.bar > 0, `cell progress bar ${wc.bar}`);
      expect(gr.total === exp.total && gr.total >= totalBefore, `total ${gr.total}`);
      const r = await cellRect('Woodcutting');
      await g.tap(r.x, r.y);
      const d = await waitDetail((x) => !!x, 'detail shown').catch(() => null);
      expect(
        d && d.includes(`XP: ${Math.floor(xp).toLocaleString()}`),
        `detail ${JSON.stringify(d)} vs ${xp}`,
      );
      const r2 = await g.settleRect('.skill-cell[aria-label^="Woodcutting"]');
      await g.tap(r2.x, r2.y);
      return `tree ${pick.id}; xp ${before}->${xp}; tracker "${tracker.replace(/\n/g, ' | ')}"; cell bar ${wc.bar}`;
    },
  );
  console.log(`[skills] ${g.viewportName} done`);
});
