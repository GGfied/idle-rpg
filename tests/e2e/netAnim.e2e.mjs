// Net fishing animation: player animator is fishNet, net graphic visible, faces the spot, returns to idle/walk.
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SC = `window.__idleRpg.scene().camera.scene`;
const ST = `(() => { const sc = ${SC}; const pv = sc.player; const rig = pv.container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const front = rig.list.find((o) => o.name === 'armFrontUpper')?.list.find((o) => o.name === 'armFrontFore')?.list.find((o) => o.name === 'net');
  const layer = pv.container.list[0];
  const back = layer && layer.type === 'Container' ? layer.list.find((o) => o.name === 'net') : undefined;
  const net = (!!front && front.visible) || (!!back && back.visible);
  return { anim: sc.animState, facing: sc.facing, net }; })()`;

await withGame(
  { port: 5256 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const S = `window.__idleRpg.store.getState()`;
    const spot =
      await g.eval(`(async () => { const R = await import('/src/app/registry.ts'); const sp = [...R.CONTENT.fishingSpots.values()].find((s) => s.defId === 'net_spot' || s.spotId.includes('net')) ?? [...R.CONTENT.fishingSpots.values()][0];
      const i = ${S}.game.fishing.spots[sp.spotId]?.tile ?? 0; return { id: sp.spotId, ...sp.tiles[i] }; })()`);
    await g.setInventory(['small_fishing_net']);
    await g.teleport(spot.x, spot.y + 1);
    await g.eval(`${S}.interactSpot(${JSON.stringify(spot.id)})`);
    await g.waitFor(async () => (await g.state('fishing.session')) !== null, {
      label: 'fishing session',
    });
    await g.sleep(600);
    await check('n1', 'fishNet state + net graphic visible while fishing', async () => {
      let s = await g.eval(ST);
      for (let i = 0; i < 20 && !s.net; i++) {
        await g.sleep(60);
        s = await g.eval(ST);
      }
      expect(s.anim === 'fishNet' && s.net, `got ${JSON.stringify(s)}`);
      return JSON.stringify(s);
    });
    await check('n2', 'player faces the spot', async () => {
      const s = await g.eval(ST);
      const p = await g.state('movement.position');
      const exp = await g.eval(
        `(async () => { const A = await import('/src/render/animation/index.ts'); const sp = ${JSON.stringify(spot)}; const p = ${S}.game.movement.position; return A.facingFromStep(sp.x - p.x, sp.y - p.y); })()`,
      );
      expect(
        s.facing === exp,
        `facing ${s.facing} expected ${exp} (player ${JSON.stringify(p)} spot ${JSON.stringify(spot)})`,
      );
      return `facing ${s.facing} player ${JSON.stringify(p)} spot ${spot.x},${spot.y}`;
    });
    if (vp === 'phone') await g.screenshot('netanim-phone-cast');
    await check('n3', 'walking away returns to walk/idle, net hidden', async () => {
      await g.eval(`${S}.walkTo({ x: ${spot.x + 3}, y: ${spot.y + 1} })`);
      await g.sleep(250);
      const mid = await g.eval(ST);
      await g
        .waitFor(async () => (await g.state('movement.path')).length === 0, { label: 'walk end' })
        .catch(() => {});
      await g.sleep(400);
      const end = await g.eval(ST);
      const sess = await g.state('fishing.session');
      expect(
        sess === null && end.anim === 'idle' && !end.net && mid.anim !== 'fishNet',
        `mid ${JSON.stringify(mid)} end ${JSON.stringify(end)} session ${JSON.stringify(sess)}`,
      );
      return `mid ${mid.anim} end ${end.anim}`;
    });
    await check('n4', 'chopping still plays chop', async () => {
      await g.setInventory(['bronze_axe']);
      const tree = await g.targetOfKind('tree');
      await g.teleport(tree.x, tree.y + 2);
      await g.tapObject(tree.id);
      let seen = null;
      await g.waitFor(async () => (seen = await g.eval(ST)).anim === 'chop', {
        label: 'chop state',
      });
      expect(seen.net === false, `net visible while chopping ${JSON.stringify(seen)}`);
      return JSON.stringify(seen);
    });
  }),
);
