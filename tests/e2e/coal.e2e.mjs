// Coal rock e2e (runbook mining-fishing): level 30 gate, coal yield/xp/rubble/respawn, pickaxe level gates, ore close-ups.
// Run: node tests/e2e/coal.e2e.mjs   (port 5250, E2E_PORT overrides; shots in tests/e2e/.shots-coal)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '.shots-coal');
const port = Number(process.env.E2E_PORT ?? 5250);
const J = JSON.stringify;
const COAL = { id: 'quarry_coal_1', x: 70, y: 42 };
const ROCKS = {
  copper: { id: 'quarry_copper_1', x: 73, y: 41 },
  tin: { id: 'quarry_tin_1', x: 70, y: 44 },
  iron: { id: 'quarry_iron_1', x: 77, y: 45 },
  coal: COAL,
};
const count = (g, id) =>
  g.eval(
    `window.__e.game().inventory.slots.reduce((n, s) => n + (s && s.itemId === ${J(id)} ? s.quantity : 0), 0)`,
  );
const miningXp = (g) => g.eval('window.__e.game().progression.xp.mining ?? 0');
const node = (g, id) =>
  g.eval(`JSON.stringify(window.__e.game().gathering.nodes[${J(id)}] ?? null)`);
const art = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.nodes.get(${J(id)}).art.texture.key`);
const tapRock = async (g, r) => {
  const p = await g.tileClient(r.x, r.y, -12);
  expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `${r.id} covered at ${p.x},${p.y}`);
  await g.tap(p.x, p.y);
};
async function shot(g, name, r) {
  await g.sleep(200);
  const p = await g.tileClient(r.x, r.y, -10);
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 70), width: 120, height: 110, scale: 4 },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.viewportName}-${name}.png`), Buffer.from(data, 'base64'));
}
const KIT = ['bronze_pickaxe'];

await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g.viewportName = vp;
    await g.teleport(COAL.x, COAL.y + 3);

    await check('c1', 'Mining 29: coal tap -> level-30 line, no ore, no xp', async () => {
      await g.setInventory(KIT);
      await g.setLevel('mining', 29);
      const xp0 = await miningXp(g);
      await tapRock(g, COAL);
      await g.waitFor(async () => (await g.chatLines()).some((l) => /Mining level of 30/.test(l)), {
        label: 'level line',
      });
      await g.sleep(1500);
      const ore = await count(g, 'coal');
      const n = await node(g, COAL.id);
      const dxp = (await miningXp(g)) - xp0;
      const sess = await g.eval('JSON.stringify(window.__e.game().gathering.session)');
      expect(ore === 0 && dxp === 0, `coal ${ore} xp ${dxp}`);
      expect(n === 'null' || JSON.parse(n).respawnAt == null, `node depleted ${n}`);
      return `line seen; coal ${ore}, xp +${dxp}, session ${sess}`;
    });

    await check('c2', 'Mining 30: coal in inv w/ icon, +60 xp, rubble, respawn', async () => {
      await g.teleport(COAL.x, COAL.y + 3);
      await g.setInventory(KIT);
      await g.setLevel('mining', 30);
      const xp0 = await miningXp(g);
      const a0 = await art(g, COAL.id);
      let a1;
      await g.realTime(async () => {
        await tapRock(g, COAL);
        await g.waitFor(
          async () => {
            const n = JSON.parse(await node(g, COAL.id));
            return n && n.respawnAt != null;
          },
          { timeoutMs: 60000, label: 'coal depleted' },
        );
        await g.sleep(250);
        a1 = await art(g, COAL.id);
      });
      const ore = await count(g, 'coal');
      const dxp = (await miningXp(g)) - xp0;
      const icon = await g.eval(
        `(() => { const i = document.querySelector('.slot[aria-label^="Coal"] img.slot-icon'); return i ? i.complete && i.naturalWidth > 0 : false })()`,
      );
      expect(ore === 1, `coal ${ore}`);
      expect(dxp === 60, `xp +${dxp}`);
      expect(icon, 'no coal icon img in inventory slot');
      expect(a1 !== a0, `art unchanged ${a0}`);
      const t0 = Date.now();
      await g.waitFor(async () => (await art(g, COAL.id)) === a0, {
        timeoutMs: 20000,
        label: 'respawn',
      });
      return `coal ${ore}, xp +${dxp}, icon ${icon}, art ${a0} -> ${a1} -> ${a0} (${Date.now() - t0} ms after rubble)`;
    });

    await check(
      'c3',
      'pickaxe gates: iron@10, steel@20 (real startGather + gatherEnv)',
      async () => {
        const rows = [
          ['bronze@1', ['bronze_pickaxe'], 1, 4],
          ['iron@9 (has iron)', ['bronze_pickaxe', 'iron_pickaxe'], 9, 4],
          ['iron@10', ['bronze_pickaxe', 'iron_pickaxe'], 10, 3],
          ['steel@19 (has steel)', ['bronze_pickaxe', 'steel_pickaxe'], 19, 4],
          ['steel@20', ['bronze_pickaxe', 'steel_pickaxe'], 20, 2],
          ['all@20', ['bronze_pickaxe', 'iron_pickaxe', 'steel_pickaxe'], 20, 2],
        ];
        const out = [];
        for (const [name, inv, lvl, want] of rows) {
          await g.setInventory(inv);
          await g.setLevel('mining', lvl);
          const got = await g.eval(`(async () => {
          const { startGather } = await import('/src/core/skills/index.ts');
          const { gatherEnv } = await import('/src/app/game/systems.ts');
          const { CONTENT } = await import('/src/app/registry.ts');
          const st = window.__e.game();
          const r = startGather(st.gathering, 'quarry_copper_1', 'copper_rock', gatherEnv(st, CONTENT));
          return JSON.stringify(r.value?.state?.session?.cooldown ?? r);
        })()`);
          out.push(`${name}: ${got}`);
          expect(Number(got) === want, `${name} attempt ticks ${got}, want ${want}`);
        }
        return out.join('; ');
      },
    );

    await check('c4', 'close-ups of 4 ore rocks (look at PNGs)', async () => {
      await g.setInventory(KIT);
      for (const [name, r] of Object.entries(ROCKS)) {
        await g.teleport(r.x, r.y + 3, { settleMs: 1200 });
        await g.realTime(() => g.sleep(0));
        await shot(g, name, r);
      }
      return `saved to ${SHOTS}`;
    });

    await check('c5', 'no console errors', async () => {
      const e = g.consoleErrors();
      expect(e.length === 0, e.join(' | '));
      return '0 errors';
    });
  }),
);
