// Long-walk e2e: movement's bounded A* (4000-node cap -> partial leg -> re-path on arrival via MovementState.destination).
// Far routes dispatched via the walkTo intent (what a tap/minimap tap sends: a minimap only shows ~30 tiles), cancel by a REAL canvas tap.
// Run: node tests/e2e/longWalk.e2e.mjs
// Fast base: desktop + phone as parallel children (webgl only: nothing drawn is asserted), ?tickMs=30, stability
// windows wait on the game tick counter (waitState) instead of computed sleeps, teleport preconditions, budget 60 s.
import process from 'node:process';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9311; // C7 port block 9301-9350; 2 combos use 9311-9312
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const DISCOVER = `(async () => {
  const w = await import('/src/features/world/index.ts'); const mv = await import('/src/features/movement/index.ts');
  const grid = w.createWorldCollisionGrid(); const t0 = Date.now();
  const sim = (S, to) => { let st = mv.setDestination(mv.createMovementState(S), grid, to); let legs = 1, ticks = 0;
    while (st.path.length > 0 && ticks < 5000) { const before = st.path.length; st = mv.tickMovement(st, {}, grid).state; ticks++; if (st.path.length > before) legs++; }
    return { legs, ticks, end: st.position }; };
  const D = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const starts = [{ x: 2, y: 2 }, w.PLAYER_SPAWN];
  let multi = null, unreach = null, water = null;
  for (const S of starts) { if (!grid.isWalkable(S.x, S.y)) continue;
    for (let y = 1; y < grid.height; y += 3) for (let x = 1; x < grid.width; x += 3) {
      const t = { x, y }; if (D(S, t) < 80 || Date.now() - t0 > 25000) continue;
      const r = sim(S, t); const walk = grid.isWalkable(x, y);
      if (!multi && walk && r.legs >= 2 && D(r.end, t) === 0) multi = { S, t, r };
      if (!unreach && r.ticks > 20 && D(r.end, t) > 3) unreach = { S, t, r, walk };
      if (!water && !walk && r.ticks > 40) water = { S, t, r };
    } }
  return JSON.stringify({ multi, unreach, water, ms: Date.now() - t0 });
})()`;

const TRACK = `(() => { window.__lw = []; window.__lwUnsub?.(); let last = null;
  window.__lwUnsub = window.__idleRpg.store.subscribe((n) => { const g = n.game, m = g.movement;
    const e = { tick: g.tick, x: m.position.x, y: m.position.y, pl: m.path.length, dest: m.destination ? 1 : 0 };
    if (!last || last.x !== e.x || last.y !== e.y || last.pl !== e.pl || last.dest !== e.dest) { window.__lw.push(e); last = e; } }); })()`;

const mv = (g) => g.state('movement');
async function settle(g, ms = 40000) {
  await g.waitFor(
    async () => {
      const m = await mv(g);
      return m.path.length === 0 && !m.destination;
    },
    { timeoutMs: ms, label: 'walk finished' },
  );
}
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** Wait until n more game ticks have run (reads the tick counter, not a computed sleep); returns the start tick. */
async function waitGameTicks(g, n) {
  const t0 = await g.state('tick');
  await g.waitState('tick', `t => t >= ${t0 + n}`, { label: `${n} ticks`, timeoutMs: 15000 });
  return t0;
}

let disc;
// tickMs 30 = hook minimum: the 89- and 107-tile walks take half as long (rules unchanged)
await withCombos({ port: PORT, budgetMs: BUDGET_MS, tickMs: 30 }, COMBOS, async (g, vp) => {
  disc ??= JSON.parse(await g.eval(DISCOVER));
  // Mutation proofs: discovery runs the (mutated) planner in-page, so LW_FORCE=sx,sy,tx,ty pins the multi-leg pair found on clean code.
  if (process.env.LW_FORCE) {
    const [sx, sy, tx, ty] = process.env.LW_FORCE.split(',').map(Number);
    disc.multi = { S: { x: sx, y: sy }, t: { x: tx, y: ty }, r: { legs: 0, ticks: 0 } };
  }
  const { multi, unreach: ur, water } = disc;
  const unreach = ur ?? water;
  await check('t0', 'discovered a far reachable multi-leg target and a far unreachable one', () => {
    expect(multi && unreach, 'discovery ' + JSON.stringify(disc));
    return `multi ${JSON.stringify(multi.S)} -> ${JSON.stringify(multi.t)} sim legs ${multi.r.legs} ticks ${multi.r.ticks}; unreachable (${ur ? 'enclosed/unreachable' : 'water'}) ${JSON.stringify(unreach.S)} -> ${JSON.stringify(unreach.t)} sim end ${JSON.stringify(unreach.r.end)} ticks ${unreach.r.ticks}; search ${disc.ms} ms`;
  });
  if (!multi || !unreach) return;
  const T = multi.t,
    S = multi.S,
    US = unreach.S;
  let log = [];

  await check('t1', `walk to far tile (>=80 away) arrives at exactly the tile`, async () => {
    await g.teleport(S.x, S.y, { settleMs: 0 }); // walkTo is an intent: no camera settle needed
    await g.eval(TRACK);
    await g.walkTo(T.x, T.y);
    await settle(g);
    log = await g.eval('window.__lw');
    const p = (await mv(g)).position;
    expect(p.x === T.x && p.y === T.y, `ended ${JSON.stringify(p)} wanted ${JSON.stringify(T)}`);
    return `${vp}: ${dist(S, T)} tiles, ended ${JSON.stringify(p)} in ${log.at(-1).tick - log[0].tick} ticks`;
  });

  await check('t2', 'route needs >1 leg, idle ticks between legs <= 2', async () => {
    let legs = 1,
      maxIdle = 0,
      lastMoveTick = null,
      firstMove = false;
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1],
        b = log[i];
      if (b.pl > a.pl && b.tick > log[0].tick && a.dest) legs++;
      if (b.x !== a.x || b.y !== a.y) {
        if (lastMoveTick !== null) maxIdle = Math.max(maxIdle, b.tick - lastMoveTick - 1);
        lastMoveTick = b.tick;
        firstMove = true;
      }
    }
    expect(firstMove, 'never moved');
    expect(legs >= 2, `legs ${legs}`);
    expect(maxIdle <= 2, `max idle ticks between moves ${maxIdle}`);
    return `${vp}: legs ${legs}, max idle ticks ${maxIdle}, pure-sim legs ${multi.r.legs}`;
  });

  await check(
    't3',
    'unreachable far target: stops at closest tile, no loop, no chat spam',
    async () => {
      const U = unreach.t;
      await g.teleport(US.x, US.y, { settleMs: 0 });
      const chat0 = (await g.chatLines()).length;
      await g.eval(TRACK);
      await g.walkTo(U.x, U.y);
      await settle(g, 40000);
      const lg = await g.eval('window.__lw');
      const p = (await mv(g)).position;
      const t0 = await waitGameTicks(g, 20); // stability window: 20 game ticks
      const m2 = await mv(g);
      const t1 = await g.state('tick');
      expect(t1 - t0 >= 15, `only ${t1 - t0} ticks passed`);
      expect(
        m2.position.x === p.x && m2.position.y === p.y && m2.path.length === 0 && !m2.destination,
        `not stable: ${JSON.stringify(p)} -> ${JSON.stringify(m2.position)} path ${m2.path.length}`,
      );
      expect(
        dist(p, U) < dist(US, U),
        `no progress: ended ${JSON.stringify(p)} d=${dist(p, U)} start d=${dist(US, U)}`,
      );
      expect(dist(p, US) > 0, 'never moved');
      const newChat = (await g.chatLines()).slice(chat0);
      const chat1 = chat0 + newChat.length;
      // area-entry lines are legitimate while crossing zones; anything else (or repeats) is spam
      const odd = newChat.filter((l) => !/^(You (enter|arrive)|Welcome|Entering)/i.test(l));
      expect(
        odd.length === 0 && newChat.length <= 8,
        () => `chat spam: ${JSON.stringify(newChat)}`,
      );
      expect(lg.length < 2000, `state churn ${lg.length}`);
      return `${vp}: target ${JSON.stringify(U)}, ended ${JSON.stringify(p)} (d ${dist(p, U)} from d ${dist(US, U)}), ${lg.at(-1).tick - lg[0].tick} ticks, stable ${t1 - t0} ticks, chat +${chat1 - chat0} (area entries only), pure-sim end ${JSON.stringify(unreach.r.end)}`;
    },
  );

  await check('t4', 'a real tap mid-walk cancels the long route', async () => {
    // 200 ms ticks for this phase: the tap target is picked "2 tiles from the player" and the follow camera moves
    // under the finger; at 30/60 ms ticks the player covers several tiles per CDP round trip under load, so the tap
    // lands on a stale tile (seen: phone ended 8-13 tiles from the tap at 30 and 60 ms, desktop passed).
    await g.setTickMs(200);
    await g.teleportSettled(S.x, S.y); // the cancel is a real canvas tap: camera must be on the player
    await g.walkTo(T.x, T.y);
    await g.waitFor(async () => dist((await mv(g)).position, S) >= 12, {
      label: '12 tiles along',
    });
    // let the camera follow, then tap a walkable tile 2-3 tiles from the player
    let tapped = null;
    for (const [dx, dy] of [
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
      [2, 2],
      [-2, -2],
      [3, 0],
      [0, 3],
      [-3, 0],
      [0, -3],
    ]) {
      const p = (await mv(g)).position;
      const tx = p.x + dx,
        ty = p.y + dy;
      const ok2 = await g.eval(
        `(async () => { const w = await import('/src/features/world/index.ts'); return w.createWorldCollisionGrid().isWalkable(${tx}, ${ty}); })()`,
      );
      if (!ok2) continue;
      try {
        await g.tapTile(tx, ty);
        tapped = { x: tx, y: ty, from: p };
        break;
      } catch {
        /* covered by HUD or moved: next */
      }
    }
    expect(tapped, 'no tappable tile near the player');
    await g.setTickMs(30); // tap delivered: the rest (walk to the tap, 15-tick stability window) at full speed
    await settle(g, 15000);
    await waitGameTicks(g, 15);
    const m = await mv(g);
    expect(!m.destination && m.path.length === 0, 'still has a route');
    expect(
      dist(m.position, tapped) <= 6,
      `ended ${JSON.stringify(m.position)} far from tap ${JSON.stringify(tapped)}`,
    );
    expect(dist(m.position, T) > 20, 'carried on to the far target');
    return `${vp}: tapped ${JSON.stringify({ x: tapped.x, y: tapped.y })} while at ${JSON.stringify(tapped.from)}; ended ${JSON.stringify(m.position)}, ${dist(m.position, T)} tiles short of far target`;
  });
});
