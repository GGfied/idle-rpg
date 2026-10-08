// Food icons: raw / cooked / burnt in one bag, screenshot desktop + phone. Run: node tests/e2e/foodIcons.e2e.mjs
// Converted to the fast-base template: parallel viewports (7501/7502), wait-on-state instead of a 700 ms sleep.
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-food/', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT ?? 7501);
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
const BAG = [
  'raw_shrimp',
  'shrimps',
  'burnt_fish',
  'raw_trout',
  'trout',
  'raw_chicken',
  'cooked_chicken',
  'burnt_meat',
  'raw_beef',
  'cooked_beef',
  'raw_sardine',
  'sardine',
  'raw_herring',
  'herring',
  'raw_anchovies',
  'anchovies',
  'raw_mackerel',
  'mackerel',
];
await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    await g.setInventory(BAG);
    await g.eval(
      `(() => { const b = document.querySelector('[aria-expanded="false"]'); if (b) b.click(); })()`,
    );
    const SVGS = `document.querySelectorAll('img[src*="svg"], img[src^="data:image/svg"]').length`;
    await g.waitFor(async () => (await g.eval(SVGS)) >= BAG.length, {
      label: 'bag icons rendered',
    });
    await check('i1', 'bag with raw + cooked + burnt food, screenshot', async () => {
      const n = await g.eval(SVGS);
      expect(n >= BAG.length, `${n} svg imgs < ${BAG.length}`);
      const f = await g.screenshot(`inventory-${vp}`);
      return `${vp}: ${n} svg imgs, ${f}`;
    });
  }),
);
