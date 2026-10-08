// Skill tags on events (runbook mining-fishing 6b-B): itemGathered/nodeDepleted carry `skill`, so vfx + audio pick
// the right cues. Run: node tests/e2e/skillTags.e2e.mjs  (port 5247, E2E_PORT overrides; SHOTS_DIR=tests/e2e/.shots-vfxB)
// Spy: wraps the scene's vfx.handleEvent (the same {...e} events the audio dispatcher gets from the runtime), then
// resolves them with the REAL planEvent (vfx cues) and resolveEventSounds (audio table), plus a live particle count.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR ?? resolve(HERE, '.shots-vfxB');
const port = Number(process.env.E2E_PORT ?? 5247);
const COPPER = { id: 'quarry_copper_1', x: 73, y: 41 };
const SPY = `(async () => {
  const V = await import('/src/render/vfx/logic.ts'), D = await import('/src/render/vfx/data.ts'),
    A = await import('/src/audio/logic.ts');
  const w = window.__idleRpg.scene().camera.scene; const vfx = w.vfx; const orig = vfx.handleEvent;
  window.__spy = [];
  vfx.handleEvent = function (e, ctx) {
    if (e.type === 'itemGathered' || e.type === 'nodeDepleted')
      window.__spy.push({ type: e.type, skill: e.skill ?? null, nodeId: e.nodeId,
        effects: V.planEvent(e, ctx, D.EVENT_VFX).map((p) => p.effect), sounds: [...A.resolveEventSounds(e)] });
    return orig.call(this, e, ctx);
  };
  return true; })()`;
const spy = async (g) => JSON.parse(await g.eval(`JSON.stringify(window.__spy)`));

async function shot(g, name) {
  const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.viewportName}-${name}.png`), Buffer.from(data, 'base64'));
}

await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g.viewportName = vp;
    await g.eval(SPY);

    await check(
      's1',
      'tree: log gained -> logPuff, skill woodcutting; fall -> treeFall + leafBurst',
      async () => {
        await g.setInventory(['bronze_axe']);
        const tree = await g.targetOfKind('tree');
        await g.teleport(tree.x, tree.y + 3);
        await g.tapObject(tree.id);
        await g.waitFor(async () => (await spy(g)).some((e) => e.type === 'nodeDepleted'), {
          timeoutMs: 40000,
          label: 'tree depleted',
        });
        const ev = await spy(g);
        const got = ev.find((e) => e.type === 'itemGathered');
        const dep = ev.find((e) => e.type === 'nodeDepleted');
        expect(got && got.skill === 'woodcutting', `itemGathered ${JSON.stringify(got)}`);
        expect(got.effects.includes('logPuff'), `gather effects ${got.effects}`);
        expect(dep.skill === 'woodcutting', `nodeDepleted skill ${dep.skill}`);
        expect(
          dep.effects.includes('treeFallDust') && dep.effects.includes('leafBurst'),
          `tree effects ${dep.effects}`,
        );
        expect(!dep.effects.some((x) => /rock/.test(x)), `rock effects on tree ${dep.effects}`);
        expect(
          dep.sounds.includes('treeFall') && !dep.sounds.includes('rockCrumble'),
          `tree sounds ${dep.sounds}`,
        );
        return `${vp}: gather ${got.effects}; deplete ${dep.effects} / ${dep.sounds}`;
      },
    );

    await check(
      's2',
      'copper rock depletes -> rockBurst+rockPebbles, rockCrumble, no tree cues',
      async () => {
        await g.eval('window.__spy.length = 0');
        await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
        await g.teleport(COPPER.x, COPPER.y + 3);
        const tap = async () => {
          const p = await g.tileClient(COPPER.x, COPPER.y, -12);
          expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `rock covered ${p.x},${p.y}`);
          await g.tap(p.x, p.y);
        };
        await tap();
        await g.waitFor(async () => (await spy(g)).some((e) => e.type === 'nodeDepleted'), {
          timeoutMs: 60000,
          label: 'rock depleted',
        });
        await shot(g, 'rock-depleted');
        const ev = await spy(g);
        const got = ev.find((e) => e.type === 'itemGathered');
        const dep = ev.find((e) => e.type === 'nodeDepleted');
        expect(got && got.skill === 'mining', `itemGathered ${JSON.stringify(got)}`);
        expect(dep.skill === 'mining', `nodeDepleted skill ${dep.skill}`);
        expect(
          dep.effects.includes('rockBurst') && dep.effects.includes('rockPebbles'),
          `rock effects ${dep.effects}`,
        );
        expect(
          !dep.effects.some((x) => x === 'treeFallDust' || x === 'leafBurst'),
          `tree effects on rock ${dep.effects}`,
        );
        expect(
          dep.sounds.includes('rockCrumble') && !dep.sounds.includes('treeFall'),
          `rock sounds ${dep.sounds}`,
        );
        return `${vp}: deplete skill ${dep.skill} ${dep.effects} / ${dep.sounds}`;
      },
    );
  }),
);
