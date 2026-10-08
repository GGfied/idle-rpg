// Net fishing animation: player animator is fishNet, net graphic visible, faces the spot, returns to idle/walk.
// Run: node tests/e2e/netAnim.e2e.mjs (ports 9422-9423, E2E_PORT overrides; fast base: parallel desktop + phone
// children, ?tickMs=60, wait-on-state instead of sleeps, budget 60 s).
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9422;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const SC = `window.__idleRpg.scene().camera.scene`;
const ST = `(() => { const sc = ${SC}; const pv = sc.player; const rig = pv.container.list.find((o) => o.type === 'Container' && o.list.length === 4);
  const front = rig.list.find((o) => o.name === 'armFrontUpper')?.list.find((o) => o.name === 'armFrontFore')?.list.find((o) => o.name === 'net');
  const layer = pv.container.list[0];
  const back = layer && layer.type === 'Container' ? layer.list.find((o) => o.name === 'net') : undefined;
  const net = (!!front && front.visible) || (!!back && back.visible);
  return { anim: sc.animState, facing: sc.facing, net }; })()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const S = `window.__idleRpg.store.getState()`;
  const spot =
    await g.eval(`(async () => { const R = await import('/src/app/registry.ts'); const sp = [...R.CONTENT.fishingSpots.values()].find((s) => s.defId === 'net_spot' || s.spotId.includes('net')) ?? [...R.CONTENT.fishingSpots.values()][0];
      const i = ${S}.game.fishing.spots[sp.spotId]?.tile ?? 0; return { id: sp.spotId, ...sp.tiles[i] }; })()`);
  await g.setInventory(['small_fishing_net']);
  await g.teleport(spot.x, spot.y + 1, { settleMs: 0 });
  // Precondition: no spot hop mid-check (spots hop every 60-120 ticks = 3.6-7.2 s at 60 ms ticks): once the spot is
  // tracked, push every move timer far ahead.
  await g.waitState('fishing.spots', `s => !!s && !!s[${JSON.stringify(spot.id)}]`, {
    label: 'spot tracked',
  });
  await g.update(`({ ...g, fishing: { ...g.fishing, spots: Object.fromEntries(Object.entries(g.fishing.spots).map(
      ([k, s]) => [k, { ...s, moveTimer: { respawnAt: g.tick + 1e9 } }])) } })`);
  await g.eval(`${S}.interactSpot(${JSON.stringify(spot.id)})`);
  await g.waitFor(async () => (await g.state('fishing.session')) !== null, {
    label: 'fishing session',
  });
  await check('n1', 'fishNet state + net graphic visible while fishing', async () => {
    // Wait on the drawn state (replaces a fixed 600 ms + a 20 x 60 ms polling loop).
    let s = await g.eval(ST);
    await g
      .waitFor(async () => (s = await g.eval(ST)).anim === 'fishNet' && s.net, {
        label: 'fishNet + net shown',
        timeoutMs: 4000,
      })
      .catch(() => {}); // the expect below reports the state
    expect(s.anim === 'fishNet' && s.net, `got ${JSON.stringify(s)}`);
    return JSON.stringify(s);
  });
  await check('n2', 'player faces the spot', async () => {
    // the walk to the shore tile may still be turning the player (stale facing vs position read under load): settle first
    await g.waitIdle();
    await g.waitTicks(3);
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
    const p0 = await g.state('movement.position');
    await g.eval(`${S}.walkTo({ x: ${spot.x + 3}, y: ${spot.y + 1} })`);
    // mid-walk sample once the player has left the fishing tile (replaces a fixed 250 ms)
    await g
      .waitState('movement.position', `p => p.x !== ${p0.x} || p.y !== ${p0.y}`, {
        label: 'walk started',
        timeoutMs: 4000,
      })
      .catch(() => {});
    const mid = await g.eval(ST);
    await g
      .waitFor(async () => (await g.state('movement.path')).length === 0, { label: 'walk end' })
      .catch(() => {});
    let end = await g.eval(ST);
    await g
      .waitFor(async () => (end = await g.eval(ST)).anim === 'idle' && !end.net, {
        label: 'back to idle',
        timeoutMs: 3000,
      })
      .catch(() => {}); // the expect below reports the state (replaces a fixed 400 ms)
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
    await g.teleportSettled(tree.x, tree.y + 2);
    await g.tapObject(tree.id);
    let seen = null;
    await g.waitFor(async () => (seen = await g.eval(ST)).anim === 'chop', {
      label: 'chop state',
    });
    expect(seen.net === false, `net visible while chopping ${JSON.stringify(seen)}`);
    return JSON.stringify(seen);
  });
});
