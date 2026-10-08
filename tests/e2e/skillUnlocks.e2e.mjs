// U3: skill unlock tree in the Skills panel, driven with real taps. Run: node tests/e2e/skillUnlocks.e2e.mjs
// Fast base: runParallel desktop + phone (Skills panel DOM: renderer does not matter, webgl), fast ticks,
// "skills panel changed" waits instead of 150 ms sleeps after each skill tap, budget 60 s.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = Number(process.env.E2E_PORT ?? 9477); // combos use 9477..9478
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
// Shots go to a gitignored .shots dir (was '.', which dropped skill-tree-*.png into the repo root).
const OUT =
  process.env.SHOT_DIR ??
  new URL('./.shots-skillUnlocks/', import.meta.url).pathname.replace(/\/$/, '');
mkdirSync(OUT, { recursive: true });
const BRANCHES = {
  woodcutting: ['Trees', 'Axes'],
  mining: ['Rocks', 'Pickaxes'],
  fishing: ['Fish', 'Tools'],
};
const NAME = {
  cooking: 'Cooking',
  woodcutting: 'Woodcutting',
  mining: 'Mining',
  fishing: 'Fishing',
  attack: 'Attack',
};

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  // Real taps: Skills tab, (phone: expand with the fold button first), then the skill cell.
  const openSkillsTab = async () => {
    if (g.touch && (await g.eval(`!!document.querySelector('[aria-label="Expand panel"]')`)))
      await g.tapSelector('[aria-label="Expand panel"]');
    await g.tapSelector('[role="tab"]:nth-child(2)');
    await g.waitFor(() => g.eval('!!document.querySelector(".skill-grid")'), { label: 'grid' });
  };
  const cell = (s) => `.skill-cell[aria-label^="${NAME[s]} level"]`;
  // A skill tap opens, switches or closes the detail + tree: wait for the panel DOM to change (never throws;
  // each check's own expect() reports a tap that did nothing).
  const PANEL = `document.querySelector('.skill-grid')?.parentElement?.innerHTML ?? ''`;
  const tapSkill = async (s) => {
    const before = await g.eval(PANEL);
    await g.tapSelector(cell(s));
    await g
      .waitFor(async () => (await g.eval(PANEL)) !== before, {
        label: `skills panel after ${s}`,
        timeoutMs: 3000,
      })
      .catch(() => {});
  };
  const tree = () =>
    g.eval(`(() => {
        const t = document.querySelector('.skill-tree'); if (!t) return null;
        const gr = document.querySelector('.skill-grid').getBoundingClientRect(), tr = t.getBoundingClientRect();
        const nodes = [...t.querySelectorAll('.skill-node')];
        return { heads: [...t.querySelectorAll('.skill-branch-head')].map((h) => h.textContent),
          rootSvg: !!t.querySelector('.skill-tree-root svg, .skill-tree-root img, .skill-tree-root canvas'),
          gl: gr.left, gw: gr.width, tl: tr.left, tw: tr.width, sw: t.scrollWidth, cw: t.clientWidth,
          bodyOver: document.documentElement.scrollWidth > innerWidth,
          clipped: nodes.some((n) => n.scrollWidth > n.clientWidth + 1 || [...n.children].some((c) => c.scrollWidth > c.clientWidth + 1)),
          nodes: nodes.map((n) => ({ locked: n.hasAttribute('data-locked'), html: n.outerHTML, text: n.innerText.replace(/\\n+/g, ' | '),
            imgs: n.querySelectorAll('img').length, aria: n.querySelectorAll('[aria-label]').length,
            src: n.querySelector('img')?.getAttribute('src') ?? null, lv: n.querySelector('.skill-node-lv')?.textContent ?? '' })) };
      })()`);
  await openSkillsTab();

  for (const s of ['woodcutting', 'mining', 'fishing']) {
    await check(`u3-${s}`, `${s}: tree root + branches`, async () => {
      await tapSkill(s);
      const t = await tree();
      g.expect(t, 'no tree');
      g.expect(JSON.stringify(t.heads) === JSON.stringify(BRANCHES[s]), JSON.stringify(t.heads));
      g.expect(t.rootSvg, 'no root skill icon');
      return `${vp}: branches ${t.heads.join('|')}, ${t.nodes.length} nodes, root icon yes`;
    });
    await check(`u3-${s}-locked`, `${s}: locked nodes leak nothing`, async () => {
      const t = await tree();
      const names =
        await g.eval(`(async () => { const m = await import('/src/app/game/skillUnlocks.ts'); const r = await import('/src/app/registry.ts');
          return m.skillUnlocks(${JSON.stringify(s)}).map((u) => ({ id: u.itemId, name: u.label, level: u.level })); })()`);
      const locked = t.nodes.filter((n) => n.locked);
      g.expect(locked.length > 0, 'no locked nodes at level 1');
      for (const n of locked) {
        g.expect(n.text.includes('?') && n.text.includes('Unknown'), n.text);
        g.expect(/Requires \w+ \d+ \(you: 1\)/.test(n.text), n.text);
        g.expect(n.imgs === 0 && n.aria === 0, `img ${n.imgs} aria ${n.aria}`);
        const lvl = Number(/Requires \w+ (\d+)/.exec(n.text)[1]);
        for (const u of names.filter((u) => u.level === lvl))
          g.expect(
            !n.html.toLowerCase().includes(u.name.toLowerCase()) && !n.html.includes(u.id),
            `locked node leaks ${u.name}: ${n.html}`,
          );
      }
      return `${vp}: ${locked.length} locked, e.g. "${locked[0].text}", 0 img, 0 aria`;
    });
    await check(`u3-${s}-width`, `${s}: tree width = grid, no overflow/clip`, async () => {
      const t = await tree();
      g.expect(Math.abs(t.gl - t.tl) <= 1 && Math.abs(t.gw - t.tw) <= 1, JSON.stringify(t));
      g.expect(t.cw > 0 && t.sw <= t.cw, `scrollWidth ${t.sw} > clientWidth ${t.cw}`);
      g.expect(!t.bodyOver && !t.clipped, `bodyOver ${t.bodyOver} clipped ${t.clipped}`);
      await g.eval('document.querySelector(".skill-tree").scrollIntoView({block:"start"})');
      const shot = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT}/skill-tree-${s}-${vp}.png`, Buffer.from(shot.data, 'base64'));
      return `${vp}: tree left ${t.tl} w ${t.tw} vs grid left ${t.gl} w ${t.gw}; sw ${t.sw} <= cw ${t.cw}`;
    });
  }

  await check(
    'u3-cooking',
    'cooking: Food branch, cooked items at recipe levels, locked rule at level 1',
    async () => {
      await tapSkill('cooking');
      const t = await tree();
      g.expect(t, 'no cooking tree');
      g.expect(JSON.stringify(t.heads) === JSON.stringify(['Food']), JSON.stringify(t.heads));
      const want = {
        Shrimp: 1,
        Anchovies: 1,
        Sardine: 1,
        Chicken: 1,
        Beef: 1,
        Herring: 5,
        Mackerel: 10,
        Trout: 15,
      };
      const shown = [];
      for (const [name, lv] of Object.entries(want)) {
        const n =
          t.nodes.find((x) => new RegExp(name, 'i').test(x.text) && !x.locked) ??
          t.nodes.find((x) => x.locked && x.text.includes(`Requires Cooking ${lv} (you: 1)`));
        g.expect(n, `no node for ${name}: ${t.nodes.map((x) => x.text).join(' ; ')}`);
        if (lv === 1) {
          g.expect(
            !n.locked && new RegExp(name, 'i').test(n.text) && n.imgs > 0 && n.lv.includes('1'),
            `${name}: ${n.text}`,
          );
        } else {
          g.expect(
            n.locked && n.text.includes('?') && n.text.includes('Unknown'),
            `${name} not locked: ${n.text}`,
          );
          g.expect(
            n.imgs === 0 && n.aria === 0 && !n.html.toLowerCase().includes(name.toLowerCase()),
            `${name} leaks: ${n.html}`,
          );
        }
        shown.push(`${name}@${lv}${n.locked ? 'L' : ''}`);
      }
      g.expect(t.nodes.length === 8, `node count ${t.nodes.length}`);
      await g.eval('document.querySelector(".skill-tree").scrollIntoView({block:"start"})');
      const shot = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT}/skill-tree-cooking-${vp}.png`, Buffer.from(shot.data, 'base64'));
      return `${vp}: ${shown.join(' ')}`;
    },
  );

  await check('u3-attack', 'unbuilt skill (Attack) shows detail but no tree', async () => {
    await tapSkill('attack');
    const has = await g.eval('!!document.querySelector(".skill-tree")');
    const detail = await g.eval('!!document.querySelector(".skill-detail")');
    g.expect(detail && !has, `detail ${detail} tree ${has}`);
    return `${vp}: detail yes, tree no`;
  });

  await check(
    'u3-unlocked',
    'unlocked nodes share the inventory icon + label + Lv; live flip at Woodcutting 15',
    async () => {
      await tapSkill('woodcutting');
      const before = await tree();
      const un = before.nodes.filter((n) => !n.locked);
      g.expect(un.length > 0, 'no unlocked nodes at level 1');
      g.expect(!before.nodes.some((n) => !n.locked && /oak/i.test(n.text)), 'oak unlocked at 1');
      const icons = await g.eval(`(async () => { const r = await import('/src/render/index.ts');
        return { oak: r.itemIconUrl('oak_logs'), logs: r.itemIconUrl('logs') }; })()`);
      const first = un.find((n) => n.imgs > 0);
      g.expect(first && /Lv \d+/.test(first.lv) && first.text.length > 0, JSON.stringify(first));
      // same source as the inventory renderer: itemIconUrl for every unlocked node's item
      const bad = await g.eval(`(async () => { const r = await import('/src/render/index.ts');
        const m = await import('/src/app/game/skillUnlocks.ts');
        const want = new Set(m.skillUnlocks('woodcutting').map((u) => r.itemIconUrl(u.itemId)));
        return [...document.querySelectorAll('.skill-node:not([data-locked]) img')].map((i) => i.getAttribute('src')).filter((s) => !want.has(s)); })()`);
      g.expect(bad.length === 0, `icons not from itemIconUrl: ${bad}`);
      await g.setLevel('woodcutting', 15);
      await g.waitFor(
        () =>
          g.eval(
            `[...document.querySelectorAll('.skill-node:not([data-locked])')].some((n) => /Oak logs/.test(n.innerText))`,
          ),
        { label: 'oak flips' },
      );
      const after = await tree();
      const oak = after.nodes.find((n) => /Oak logs/.test(n.text));
      g.expect(!oak.locked && oak.src === icons.oak, `oak src ${oak.src} vs ${icons.oak}`);
      g.expect(
        after.nodes.filter((n) => !n.locked).length > un.length,
        'unlocked count did not grow',
      );
      return `${vp}: unlocked ${un.length} -> ${after.nodes.filter((n) => !n.locked).length}; "${first.text}"; oak "${oak.text}" icon ok`;
    },
  );

  await check('u3-close', 'tapping the skill again closes detail + tree', async () => {
    await tapSkill('woodcutting'); // currently open -> toggles shut
    const r = await g.eval(
      '({ tree: !!document.querySelector(".skill-tree"), detail: !!document.querySelector(".skill-detail") })',
    );
    g.expect(!r.tree && !r.detail, JSON.stringify(r));
    return `${vp}: tree ${r.tree}, detail ${r.detail}`;
  });
});
