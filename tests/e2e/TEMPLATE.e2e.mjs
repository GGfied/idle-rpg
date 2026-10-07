// Template: copy to tests/e2e/<feature>.e2e.mjs, pick an unused port, run `node tests/e2e/<feature>.e2e.mjs`.
import { check, forEachViewport, withGame } from './lib.mjs';

await withGame(
  { port: 5299 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await check('t1', 'tap a tree, walk there and chop a log', async () => {
      await g.setInventory(['bronze_axe']);
      const tree = await g.targetOfKind('tree');
      await g.teleport(tree.x, tree.y + 4);
      await g.tapObject(tree.id);
      await g.waitFor(async () => (await g.chatLines()).some((l) => /log/i.test(l)), {
        label: 'log chat line',
      });
      return `${vp}: tile ${JSON.stringify(await g.state('movement.position'))}`;
    });
  }),
);
