// QA slice "fire blocks walking + step-aside fallback": a burning fire tile is not walkable; lighting steps W, E, S, N.
// Fast base: runParallel desktop + phone (one child each), ?tickMs=60, wait-on-state (no fixed sleeps), budget 60 s.
// Run: node tests/e2e/fireBlock.e2e.mjs
import { check, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 9160;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'], // walking rules, not drawing: renderer does not matter
  budgetMs: BUDGET_MS,
});
const LIGHT_WAIT_MS = 8000;
const START = { x: 18, y: 15 };
const key = (t) => `${t.x},${t.y}`;
const fireAt = (id, t) => ({ id, tile: { x: t.x, y: t.y }, logsId: 'logs', expiresAtTick: 1e9 });
const setFires = (g, fires) =>
  g.update(
    `({ ...g, firemaking: { ...g.firemaking, fires: ${JSON.stringify(fires)}, lighting: null }, chat: [] })`,
  );
const walkable = (g, x, y) =>
  g.eval(`import('/src/app/registry.ts').then((r) => r.CONTENT.grid.isWalkable(${x}, ${y}))`);

/** Light real logs on `at` (fires on `blocked` neighbours), return the tile the player ends on. */
async function lightAt(g, at, blockedDirs, extra = []) {
  const fires = blockedDirs.map(([dx, dy], i) => fireAt(`b${i}`, { x: at.x + dx, y: at.y + dy }));
  await setFires(g, [...fires, ...extra]);
  await g.setInventory(['tinderbox', 'logs']);
  await g.teleport(at.x, at.y, { settleMs: 0 });
  await g.eval(`window.__idleRpg.store.getState().lightSlot(1)`);
  await g.waitFor(
    async () => (await g.state('firemaking.fires')).some((f) => !f.id.startsWith('b')),
    {
      label: 'real fire lit',
      timeoutMs: 8000,
    },
  );
  // step-aside: wait for the player to leave `at` (or give up after 3 s and let the caller's check report it), then idle
  await g
    .waitState('movement.position', `p => p.x !== ${at.x} || p.y !== ${at.y}`, { timeoutMs: 3000 })
    .catch(() => {});
  await g.waitIdle();
  return g.state('movement.position');
}
/** After a tap/walkTo: wait for movement to start (if it does within 1.5 s), then for the walk to finish. */
async function walkDone(g, from) {
  await g
    .waitState(
      '',
      `g => g.movement.path.length > 0 || g.movement.position.x !== ${from.x} || g.movement.position.y !== ${from.y}`,
      { timeoutMs: 1500 },
    )
    .catch(() => {});
  await g.waitIdle();
}

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const F = { x: START.x + 2, y: START.y };
    await check('b1', 'tapping a burning fire tile never puts the player on it', async () => {
      await setFires(g, [fireAt('qa1', F)]);
      await g.setInventory(['tinderbox']);
      await g.teleportSettled(START.x, START.y);
      const stop = await g.trackMoves();
      await g.tapTile(F.x, F.y);
      await walkDone(g, START);
      const moves = await stop();
      const onFire = moves.some((m) => key(m) === key(F));
      const p = await g.state('movement.position');
      g.expect(!onFire, `player stood on fire tile ${key(F)}: ${moves.map(key).join(' > ')}`);
      g.expect(Math.abs(p.x - F.x) + Math.abs(p.y - F.y) <= 2, `ended ${key(p)}`);
      return `${vp}: path ${moves.map(key).join(' > ')}; end ${key(p)}; fire ${key(F)}`;
    });

    await check(
      'b2',
      'walkTo(fire tile) programmatic: fires are walkable (user, 2026-10-08)',
      async () => {
        await setFires(g, [fireAt('qa1', F)]);
        await g.teleport(START.x, START.y, { settleMs: 0 });
        const stop = await g.trackMoves();
        await g.walkTo(F.x, F.y);
        await walkDone(g, START);
        await stop();
        const p = await g.state('movement.position');
        g.expect(key(p) === key(F), `did not walk onto the fire: end ${key(p)}`);
        return `${vp}: end ${key(p)}`;
      },
    );

    await check(
      'b3',
      'a path crossing the fire tile walks straight through (fires are walkable)',
      async () => {
        const A = { x: F.x - 2, y: F.y };
        const B = { x: F.x + 2, y: F.y };
        await setFires(g, [fireAt('qa1', F)]);
        await g.teleportSettled(A.x, A.y);
        const stop = await g.trackMoves();
        await g.tapTile(B.x, B.y);
        await walkDone(g, A);
        const moves = await stop();
        const p = await g.state('movement.position');
        g.expect(
          key(p) === key(B),
          `did not arrive: end ${key(p)} via ${moves.map(key).join(' > ')}`,
        );
        g.expect(
          moves.some((m) => key(m) === key(F)),
          `expected to cross the fire tile: ${moves.map(key).join(' > ')}`,
        );
        return `${vp}: ${moves.map(key).join(' > ')}`;
      },
    );

    await check('b4', 'after the fire burns out the tile is walkable again', async () => {
      await setFires(g, [fireAt('qa1', F)]);
      await g.teleport(START.x, START.y, { settleMs: 0 });
      const tick = await g.state('tick');
      await g.update(
        `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 2 })) } })`,
      );
      await g.waitFor(async () => (await g.state('firemaking.fires')).length === 0, {
        label: 'burns out',
        timeoutMs: 4000,
      });
      await g.walkTo(F.x, F.y);
      await g.waitFor(async () => key(await g.state('movement.position')) === key(F), {
        label: 'arrive on ashes tile',
        timeoutMs: 5000,
      });
      return `${vp}: tick ${tick}, stood on ${key(F)} after burn-out`;
    });

    // ---- step-aside order (rule in code: W, E, S, N)
    const L = { x: 20, y: 18 };
    for (const [id, blocked, want] of [
      ['s1', [], [-1, 0]],
      ['s2', [[-1, 0]], [1, 0]],
      [
        's3',
        [
          [-1, 0],
          [1, 0],
        ],
        [0, 1],
      ],
      [
        's4',
        [
          [-1, 0],
          [1, 0],
          [0, 1],
        ],
        [0, -1],
      ],
    ]) {
      await check(
        id,
        `step-aside with blocked ${JSON.stringify(blocked)} goes ${JSON.stringify(want)}`,
        async () => {
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, 1],
            [0, -1],
          ])
            g.expect(
              await walkable(g, L.x + dx, L.y + dy),
              `neighbour ${dx},${dy} not walkable terrain`,
            );
          const p = await lightAt(g, L, blocked);
          const exp = { x: L.x + want[0], y: L.y + want[1] };
          g.expect(key(p) === key(exp), `player ${key(p)} expected ${key(exp)}`);
          return `${vp}: lit at ${key(L)}, player ${key(p)}`;
        },
      );
    }

    await check(
      's5',
      'all four neighbours blocked: lighting refused, player not on a fire, logs kept',
      async () => {
        const around = [
          [-1, 0],
          [1, 0],
          [0, 1],
          [0, -1],
        ];
        await setFires(
          g,
          around.map(([dx, dy], i) => fireAt(`b${i}`, { x: L.x + dx, y: L.y + dy })),
        );
        await g.setInventory(['tinderbox', 'logs']);
        await g.teleport(L.x, L.y, { settleMs: 0 });
        await g.eval(`window.__idleRpg.store.getState().lightSlot(1)`);
        // wait for the refusal line and the lighting attempt to end (instead of a fixed 4 s sleep)
        await g
          .waitState(
            '',
            `g => !g.firemaking.lighting && g.chat.some((c) => c.text === "You can't light a fire here.")`,
            { timeoutMs: LIGHT_WAIT_MS },
          )
          .catch(() => {});
        const p = await g.state('movement.position');
        const fires = await g.state('firemaking.fires');
        const inv = await g.state('inventory.slots');
        const chat = (await g.state('chat')).map((c) => c.text);
        g.expect(fires.length === 4, `fires ${fires.length}, expected only the 4 blockers`);
        g.expect(key(p) === key(L), `player moved to ${key(p)}`);
        g.expect(
          inv.some((x) => x?.itemId === 'logs'),
          'logs consumed',
        );
        g.expect(
          chat.includes("You can't light a fire here."),
          `no refusal in chat: ${chat.join(' | ')}`,
        );
        return `${vp}: player ${key(p)}, ${fires.length} fires`;
      },
    );

    await check('s6', 'terrain wall on W (not a fire) also steps E', async () => {
      const t = await g.eval(
        `import('/src/app/registry.ts').then((r) => { const w = r.CONTENT.grid; for (let y = 5; y < 60; y++) for (let x = 5; x < 80; x++) if (w.isWalkable(x, y) && !w.isWalkable(x - 1, y) && w.isWalkable(x + 1, y)) return { x, y }; return null; })`,
      );
      g.expect(t, 'no tile with a wall on W');
      const p = await lightAt(g, t, []);
      g.expect(key(p) === key({ x: t.x + 1, y: t.y }), `lit ${key(t)} player ${key(p)}`);
      return `${vp}: lit ${key(t)}, player ${key(p)}`;
    });
  }),
);
