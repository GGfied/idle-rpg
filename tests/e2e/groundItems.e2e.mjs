// QA slice: ground items (Drop -> tile item, tap/long-press Take, full inventory refusal, 300-tick despawn).
// Fast base: desktop + phone as parallel children (ports 9372-9373), ?tickMs=60, waits on state/camera, < 60 s.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9372;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const VIEWS = `(() => { const sc = window.__idleRpg.scene().camera.scene;
  return sc.children.list.filter((c) => c.type === 'Container' && c.list?.[0]?.texture?.key === 'ground_shadow' && c.visible && c.active)
    .map((c) => ({ x: c.x, y: c.y, key: c.list[1].texture.key })); })()`;
const NO_SPACE = "You don't have enough inventory space.";

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const inv = () => g.state('inventory.slots');
  const count = async () => (await inv()).filter(Boolean).length;
  const ground = () => g.state('ground.items');
  const pos = () => g.state('movement.position');
  const views = () => g.eval(VIEWS);
  /** Wait (no fixed sleep) until the drawn ground views number n; the caller's expect reports a mismatch. */
  const viewsBe = (n) =>
    g
      .waitFor(async () => (await views()).length === n, { timeoutMs: 3000, label: `views ${n}` })
      .catch(() => {});
  /** Wait until n more game ticks ran (reads game.tick). */
  const ticksPass = async (n) => {
    const t0 = await g.state('tick');
    await g.waitState('tick', `t => t >= ${t0 + n}`, { label: `${n} ticks` });
  };
  // A walkable tile P with P+(dx,dy) lane fully walkable, near the spawn.
  const lane =
    await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const gr = CONTENT.grid; const s = window.__e.game().movement.position;
      for (let r = 0; r < 12; r++) for (let x = s.x - r; x <= s.x + r; x++) for (let y = s.y - r; y <= s.y + r; y++) {
        for (const [dx, dy] of [[0, 3], [3, 0], [0, -3], [-3, 0]]) { let ok = true; for (let i = 0; i <= 3; i++) if (!gr.isWalkable(x + dx * i / 3, y + dy * i / 3)) ok = false; if (ok) return { x, y, dx, dy }; } } })()`);
  const near = { x: lane.x + lane.dx, y: lane.y + lane.dy };
  // Phone: the HUD sheet boots folded (0x0 slots); open it with a real tap, fold it again before canvas taps.
  const sheet = async (open) => {
    if (!g.touch) return;
    const folded = await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`);
    if (folded === open) {
      await g.tapSelector('.sheet-fold');
      await g.waitFor(
        async () =>
          (await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`)) === !open,
        { label: 'sheet fold state' },
      );
      await g.settleRect(open ? '.slot' : '.sheet-fold'); // the sheet slide has finished
    }
  };
  const dropFirstSlot = async () => {
    await sheet(true);
    await g.tapSelector('.slot');
    const r = await g.eval(
      `(() => { const b = [...document.querySelectorAll('.menu-item')].find((e) => e.textContent.trim() === 'Drop'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    expect(r, 'no Drop menu item');
    const n0 = (await ground()).length;
    await g.tap(r.x, r.y);
    await g
      .waitFor(async () => (await ground()).length > n0, { label: 'dropped', timeoutMs: 3000 })
      .catch(() => {});
    await sheet(false);
  };
  const itemPoint = async () => {
    const v = (await views())[0];
    expect(v, 'no ground view');
    return g.page(`toClient(${v.x}, ${v.y - 8})`);
  };

  await check('t1', 'Drop -> ground item on the tile, drawn, gone from inventory', async () => {
    await g.setInventory(['bronze_axe', 'bronze_axe']);
    await g.teleportSettled(lane.x, lane.y);
    await dropFirstSlot();
    const gi = await ground(),
      p = await pos();
    expect(
      gi.length === 1 && gi[0].x === p.x && gi[0].y === p.y,
      `ground ${JSON.stringify(gi)} pos ${JSON.stringify(p)}`,
    );
    expect((await count()) === 1, `inventory slots ${await count()}`);
    await viewsBe(1);
    const v = await views();
    expect(v.length === 1, `views ${JSON.stringify(v)}`);
    await g.screenshot(`ground-${vp}-dropped`);
    return `${vp}: ground ${gi[0].itemId}@${gi[0].x},${gi[0].y} despawnTick ${gi[0].despawnTick}, views ${v.length} (${v[0].key}), inv 2->${await count()}`;
  });

  await check('t2', 'tap drawn item from 3 tiles away walks there and takes it', async () => {
    await g.teleportSettled(near.x, near.y);
    const before = await count();
    const pt = await itemPoint();
    expect(
      await g.page(`topIsCanvas(${pt.x}, ${pt.y})`),
      `item at ${Math.round(pt.x)},${Math.round(pt.y)} covered`,
    );
    await g.tap(pt.x, pt.y);
    await g.waitFor(async () => (await ground()).length === 0, { label: 'item taken' });
    const p = await pos(),
      after = await count();
    expect(
      p.x === lane.x && p.y === lane.y,
      `stood at ${JSON.stringify(p)} want ${lane.x},${lane.y}`,
    );
    expect(after === before + 1, `inv ${before}->${after}`);
    await viewsBe(0);
    expect((await views()).length === 0, 'view still drawn');
    return `${vp}: walked ${JSON.stringify(near)} -> ${JSON.stringify(p)}, inv ${before}->${after}, pickup chat ${await g.chatCount('You pick up')}`;
  });

  await check('t3', 'long-press -> menu Take / Walk here / Cancel; Take picks it up', async () => {
    await dropFirstSlot();
    await g.teleportSettled(near.x, near.y);
    await viewsBe(1);
    const before = await count();
    const pt = await itemPoint();
    await g.longPress(pt.x, pt.y);
    const m = await g.eval(
      `(() => { const m = document.querySelector('.menu'); return m ? [...m.querySelectorAll('.menu-item')].map((b) => b.textContent.trim()) : null; })()`,
    );
    expect(
      m && /^Take /.test(m[0]) && m[1] === 'Walk here' && m[2] === 'Cancel',
      `menu ${JSON.stringify(m)}`,
    );
    const r = await g.eval(
      `(() => { const b = document.querySelector('.menu-item'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await g.tap(r.x, r.y);
    await g.waitFor(async () => (await ground()).length === 0, {
      label: 'item taken via menu',
    });
    const after = await count();
    expect(after === before + 1, `inv ${before}->${after}`);
    return `${vp}: menu ${m.join('/')}, inv ${before}->${after}`;
  });

  await check('t4', 'full inventory: refused with important chat, item stays', async () => {
    await g.setInventory(Array(27).fill('bronze_axe'));
    await g.teleportSettled(lane.x, lane.y);
    await dropFirstSlot(); // 26 left, 1 on ground
    await g.setInventory(Array(28).fill('bronze_axe'));
    await g.teleportSettled(near.x, near.y);
    await viewsBe(1);
    const pt = await itemPoint();
    await g.tap(pt.x, pt.y);
    await g.waitFor(async () => (await g.chatCount(NO_SPACE)) > 0, { label: 'no-space chat' });
    await ticksPass(5); // the item must stay (old fixed 300 ms = 5 ticks at 60 ms)
    const gi = await ground(),
      c = await count();
    const line = await g.state(`chat.find((l) => l.text === ${JSON.stringify(NO_SPACE)})`);
    expect(gi.length === 1 && c === 28, `ground ${gi.length} inv ${c}`);
    expect(line && line.important === true, `chat line ${JSON.stringify(line)}`);
    expect((await g.state('pendingGround')) === null, 'pendingGround not cleared');
    await g.screenshot(`ground-${vp}-full`);
    return `${vp}: chat important=${line.important}, ground ${gi.length}, inv ${c}, pending null`;
  });

  await check('t5', 'despawns after 300 ticks (state + view gone)', async () => {
    const gi0 = (await ground())[0];
    expect(gi0, 'no ground item to despawn');
    await g.teleportSettled(near.x, near.y);
    // Precondition instead of waiting 300 ticks (18 s at 60 ms): shift the dropped item's spawn/despawn ticks back so
    // it falls due 10 ticks from now. The 300-tick span is asserted on the REAL drop (gi0); the removal rule
    // (tick >= despawnTick -> state + view gone, not early) is asserted on the shifted item (gi).
    const now = await g.state('tick');
    const shift = Math.max(0, gi0.despawnTick - now - 10);
    await g.update(
      `({ ...g, ground: { ...g.ground, items: g.ground.items.map((it) => ({ ...it, spawnTick: it.spawnTick - ${shift}, despawnTick: it.despawnTick - ${shift} })) } })`,
    );
    const gi = { ...gi0, spawnTick: gi0.spawnTick - shift, despawnTick: gi0.despawnTick - shift };
    const t0 = await g.state('tick');
    let t1 = t0;
    await g.waitFor(
      async () => {
        t1 = await g.state('tick');
        return (await ground()).length === 0;
      },
      { timeoutMs: 40000, label: 'despawn' },
    );
    await viewsBe(0);
    const nv = (await views()).length;
    const d = gi0.despawnTick - gi0.spawnTick;
    expect(d === 300, `despawn span ${d}`);
    expect(
      t1 >= gi.despawnTick && t1 <= gi.despawnTick + 5,
      `gone at tick ${t1}, due ${gi.despawnTick}`,
    );
    expect(nv === 0, `views ${nv}`);
    return `${vp}: drop spawn ${gi0.spawnTick} due ${gi0.despawnTick} (span ${d}); shifted -${shift}: due ${gi.despawnTick} gone at tick ${t1}, views ${nv}, inv still ${await count()}`;
  });
});
