// Fishing gameplay (runbook mining-fishing task 8). Real taps on spots; DEV hook for preconditions only.
// Fast base: runParallel desktop + phone children (single page load each via withCombos), ?tickMs=60, teleportSettled
// and wait-on-state instead of fixed sleeps, budget 60 s. WebGL only: the close-up shots are for a human eye, no
// pixel assertion here (fish visibility pixels live in fishFlash/newfish).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const SHOTS = resolve(process.cwd(), 'tests/e2e/.shots-fishing');
const ASYNC = (body) =>
  `(async () => { const R = await import('/src/app/registry.ts'); const S = window.__idleRpg.store; ${body} })()`;

mkdirSync(SHOTS, { recursive: true });
const PORT = 9121; // C3 block 9101-9150 (children 9121, 9122)
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const count = (id) =>
    g.eval(
      `window.__idleRpg.store.getState().game.inventory.slots.reduce((n, s) => n + (s && s.itemId === ${JSON.stringify(id)} ? s.quantity : 0), 0)`,
    );
  const spot = (id) =>
    g.eval(
      ASYNC(
        `const sp = R.CONTENT.fishingSpots.get(${JSON.stringify(id)}); const i = S.getState().game.fishing.spots[${JSON.stringify(id)}]?.tile ?? 0; return { ...sp.tiles[i], i };`,
      ),
    );
  // Teleport + wait until the camera has really followed: the player's tile is inside the viewport and the camera is
  // still. (A bare settle can return before the follow starts when the view only moves on the next tick.)
  const standAt = async (tx, ty) => {
    await g.teleportSettled(tx, ty);
    await g
      .waitFor(
        async () => {
          const q = await g.tileClient(tx, ty, 0);
          return (
            q.x > 0 &&
            q.y > 0 &&
            q.x < (await g.eval('innerWidth')) &&
            q.y < (await g.eval('innerHeight'))
          );
        },
        { timeoutMs: 4000, label: `camera on ${tx},${ty}` },
      )
      .catch(() => {});
    await g.settle();
  };
  const tapSpot = async (id) => {
    // Spots hop every 3.6-7 s at 60 ms ticks: the tile read before a teleport can be stale and sit off-screen
    // or under the phone HUD. Re-read, stand next to the CURRENT tile and retry (max 4).
    let t = null;
    let p = null;
    for (let i = 0; i < 4; i++) {
      // Slow ticks to real time (the DEV hook clamps to 600 ms) so no hop lands between reading the tile and the tap.
      await g.setTickMs(600);
      try {
        t = await spot(id);
        await g.settle();
        p = await g.tileClient(t.x, t.y, 0);
        if (await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`)) {
          await g.tap(p.x, p.y);
          return t;
        }
      } finally {
        await g.setTickMs(g.tickMs); // fast ticks again before any teleport (the view follows on the next tick)
      }
      await standAt(t.x, t.y + 1);
    }
    const top = await g.eval(
      `(() => { const e = document.elementFromPoint(${p.x}, ${p.y}); return e ? e.tagName + '.' + e.className : null; })()`,
    );
    throw new Error(
      `spot ${id} still off-screen/covered after 4 re-teleports at ${p.x},${p.y} (top element ${top}) tile ${JSON.stringify(t)}`,
    );
  };
  const shoreFor = async (id) => {
    const t = await spot(id);
    await standAt(t.x, t.y + 1);
    return t;
  };
  // Keep fishing: whenever the session is off (hop), walk next to the new tile and re-tap, until cond().
  const fishUntil = (id, cond, label, timeoutMs = 40000) =>
    g.waitFor(
      async () => {
        if (await cond()) return true;
        if (!(await session()) && !(await g.state('pendingFishing'))) {
          const t = await spot(id);
          await standAt(t.x, t.y + 1);
          await tapSpot(id);
        }
        return false;
      },
      { timeoutMs, intervalMs: 150, label: 'fishUntil ' + label },
    );
  const session = () => g.state('fishing.session');
  const setBait = (n) =>
    g.update(
      `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s) => (s && s.itemId === 'fishing_bait' ? (${n} > 0 ? { ...s, quantity: ${n} } : null) : s)) } })`,
    );
  const kit = ['small_fishing_net', 'fishing_rod', { itemId: 'fishing_bait', quantity: 500 }];
  // Records bait/fish deltas per store update: a catch must use exactly 1 bait, no catch uses 0.
  const startRec = (fish, bait) =>
    g.eval(`(() => { const c = (id) => window.__idleRpg.store.getState().game.inventory.slots.reduce((n, s) => n + (s && s.itemId === id ? s.quantity : 0), 0);
        window.__rec = { catches: 0, bad: [], f: c('${fish}'), b: c('${bait}') };
        window.__recUnsub = window.__idleRpg.store.subscribe(() => { const f = c('${fish}'), b = c('${bait}'), r = window.__rec;
          const df = f - r.f, db = b - r.b; if (df !== 0 || db !== 0) { if ('${bait}' === 'fishing_bait' ? (df === 1 && db === -1) : (df === 1 && db === 0)) r.catches++; else r.bad.push([df, db]); }
          r.f = f; r.b = b; }); })()`);
  const stopRec = () => g.eval('(() => { window.__recUnsub(); return window.__rec; })()');

  await check('f1', 'starter kit present, reload does not duplicate it', async () => {
    const a = [
      await count('small_fishing_net'),
      await count('fishing_rod'),
      await count('fishing_bait'),
    ];
    expect(a.join() === '1,1,500', `kit ${a}`);
    // A fresh game only saves on progress (saveTrigger: a position jump counts), 1 s debounced. Make a real save
    // first so the reload loads it (the old fixed 2.5 s sleep reloaded with no save at all), then wait for it.
    await g.teleport(19, 15, { settleMs: 0 });
    const saved = await g
      .waitFor(() => g.eval(`localStorage.getItem('idle-rpg:save:1') !== null`), {
        timeoutMs: 6000,
        label: 'save written',
      })
      .catch(() => false);
    expect(saved, 'no idle-rpg:save:1 written after a position jump (precondition)');
    await g.cdp.send('Page.reload');
    await g.waitFor(() => g.eval('window.__e.ready()').catch(() => false), {
      label: 'reload ready',
    });
    const b = [
      await count('small_fishing_net'),
      await count('fishing_rod'),
      await count('fishing_bait'),
    ];
    expect(b.join() === '1,1,500', `after reload ${b}`);
    return `${vp}: ${a} -> reload ${b} (reloaded from idle-rpg:save:1)`;
  });

  await check('f2', 'net spot: cast line, shrimp, +10 xp each', async () => {
    await g.setInventory(kit);
    const xp0 = await g.state('progression.xp.fishing');
    startRec('raw_shrimp', 'x');
    const t = await shoreFor('shore_net_1');
    await g.setMovement('running: false');
    await tapSpot('shore_net_1');
    await fishUntil('shore_net_1', async () => (await count('raw_shrimp')) >= 2, 'two shrimp');
    const xp1 = await g.state('progression.xp.fishing');
    const n = await count('raw_shrimp');
    const lines = await g.chatLines();
    const r = await stopRec();
    expect(lines.includes('You cast out into the water.'), `no cast line: ${lines.slice(-4)}`);
    expect(
      lines.some((l) => l.includes('You catch some shrimp')),
      'no catch line',
    );
    expect(
      xp1 - xp0 >= n * 10 - 0.01 && Math.abs((xp1 - xp0) / n - 10) < 0.01 + 10 * 0,
      `xp ${xp0}->${xp1} for ${n} shrimp`,
    );
    expect(r.bad.length === 0, `bad deltas ${JSON.stringify(r.bad)}`);
    await g.screenshot(`net-${vp}`);
    const p = await g.tileClient(t.x, t.y, 0);
    const { data } = await g.cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: Math.max(0, p.x - 90),
        y: Math.max(0, p.y - 70),
        width: 180,
        height: 140,
        scale: 3,
      },
    });
    writeFileSync(`${SHOTS}/net-closeup-${vp}.png`, Buffer.from(data, 'base64'));
    return `${vp}: ${n} shrimp, xp ${xp0}->${xp1}`;
  });

  await check(
    'f3',
    'bait spot: L1 too-low line; L5 sardine consumes exactly 1 bait per catch',
    async () => {
      await g.setInventory(kit);
      await g.update('({ ...g, chat: [] })');
      const t = await shoreFor('shore_bait_1');
      await tapSpot('shore_bait_1');
      await g.waitFor(
        async () => (await g.chatLines()).some((l) => l.includes('Fishing level of 5')),
        { label: 'level line' },
      );
      expect(!(await session()), 'session started at L1');
      await g.setLevel('fishing', 5);
      startRec('raw_sardine', 'fishing_bait');
      await tapSpot('shore_bait_1');
      await fishUntil('shore_bait_1', async () => (await count('raw_sardine')) >= 3, '3 sardines');
      const r = await stopRec();
      const fish = await count('raw_sardine'),
        bait = await count('fishing_bait');
      expect(bait === 500 - fish, `bait ${bait} fish ${fish}`);
      expect(r.bad.length === 0 && r.catches === fish, `rec ${JSON.stringify(r)}`);
      await g.screenshot(`bait-${vp}`);
      const p = await g.tileClient(t.x, t.y, 0);
      const { data } = await g.cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, p.x - 90),
          y: Math.max(0, p.y - 70),
          width: 180,
          height: 140,
          scale: 3,
        },
      });
      writeFileSync(`${SHOTS}/bait-closeup-${vp}.png`, Buffer.from(data, 'base64'));
      return `${vp}: ${fish} sardine, bait ${bait}, deltas ok`;
    },
  );

  await check('f4', 'no bait: no-bait line on start and when bait runs out mid-fish', async () => {
    await g.update('({ ...g, chat: [] })');
    await setBait(2);
    await fishUntil(
      'shore_bait_1',
      async () => (await g.chatLines()).some((l) => l.includes('no bait left')),
      'bait runs out',
      90000,
    );
    expect((await count('fishing_bait')) === 0, 'bait left');
    expect(!(await session()), 'session still on');
    await g.update('({ ...g, chat: [] })');
    const t = await spot('shore_bait_1');
    await standAt(t.x, t.y + 1);
    await tapSpot('shore_bait_1');
    await g.waitFor(async () => (await g.chatLines()).some((l) => l.includes('no bait left')), {
      label: 'no-bait on start',
    });
    return `${vp}: no-bait line on stop and on start`;
  });

  await check('f5', 'spot hop moves the view, stops fishing, re-tap resumes', async () => {
    await g.setInventory(kit);
    await g.update('({ ...g, chat: [] })');
    await shoreFor('shore_net_2');
    await tapSpot('shore_net_2');
    await g.waitFor(async () => !!(await session()), { label: 'session' });
    const t0 = await spot('shore_net_2');
    let t1 = t0;
    await g.waitFor(
      async () => {
        t1 = await spot('shore_net_2');
        return t1.i !== t0.i;
      },
      { timeoutMs: 20000, label: 'hop' },
    );
    await g.waitState('fishing.session', 's => !s', { timeoutMs: 2000 }).catch(() => {});
    expect(
      !(await session()),
      `session survived hop ${JSON.stringify(await session())} ${t0.i}->${t1.i}`,
    );
    const lines = await g.chatLines();
    expect(lines.includes('The fish have moved on.'), `no moved line: ${lines.slice(-4)}`);
    // old tile is no longer a target
    await standAt(t0.x, t0.y + 1);
    const p0 = await g.tileClient(t0.x, t0.y, 0);
    await g.tap(p0.x, p0.y);
    await g.waitTicks(8); // a valid target would set pendingFishing/session within 1-2 ticks
    expect(
      !(await session()) && !(await g.state('pendingFishing')),
      'old tile still tappable after hop',
    );
    await standAt(t1.x, t1.y + 1);
    const n0 = await count('raw_shrimp');
    await tapSpot('shore_net_2');
    await g.waitFor(async () => !!(await session()) || (await count('raw_shrimp')) > n0, {
      label: 'resume',
    });
    return `${vp}: tile ${t0.x}->${t1.x}, old tile no longer a target, re-tap resumes`;
  });

  await check('f6', 'inventory full: stop line', async () => {
    const fill = Array.from({ length: 26 }, () => 'logs');
    await g.setInventory(['small_fishing_net', ...fill]);
    await g.update('({ ...g, chat: [] })');
    await shoreFor('shore_net_1');
    await tapSpot('shore_net_1');
    await g.waitFor(async () => (await g.chatLines()).some((l) => l.includes('too full')), {
      timeoutMs: 25000,
      label: 'full line',
    });
    expect(!(await session()), 'session still on');
    expect((await count('raw_shrimp')) === 1, `shrimp ${await count('raw_shrimp')}`);
    // full at start
    await g.setInventory(['small_fishing_net', ...fill, 'logs']);
    await g.update('({ ...g, chat: [] })');
    await shoreFor('shore_net_1');
    await tapSpot('shore_net_1');
    await g.waitFor(async () => (await g.chatLines()).some((l) => l.includes('too full')), {
      label: 'full on start',
    });
    return `${vp}: stops mid-fish and on start`;
  });

  await check('f7', 'tap water tile: player never walks onto water', async () => {
    await g.setInventory(kit);
    await standAt((await spot('shore_net_2')).x, 52);
    const stop = await g.trackMoves();
    const t = await spot('shore_net_2');
    const p = await g.tileClient(t.x + 1, t.y - 1, 0); // plain water, not a spot
    if (await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`)) await g.tap(p.x, p.y);
    await tapSpot('shore_net_2');
    // Walk over (path empty) and the cast resolved (no pending) - was a fixed 4 s sleep.
    await g
      .waitState('', 'g => g.movement.path.length === 0 && !g.pendingFishing', {
        timeoutMs: 8000,
      })
      .catch(() => {});
    const pos = await stop();
    const water = await g
      .eval(
        ASYNC(
          `return ${JSON.stringify(pos)}.filter((q) => !R.CONTENT.grid.isWalkable(q.x, q.y)).length`,
        ),
      )
      .catch(() => -1);
    expect(
      pos.every((q) => q.y >= 52),
      `positions ${JSON.stringify(pos)}`,
    );
    return `${vp}: ${pos.length} steps, min y ${Math.min(...pos.map((q) => q.y))}, unwalkable ${water}`;
  });

  await check('f8', 'bank the fish', async () => {
    await g.setInventory(['small_fishing_net', { itemId: 'raw_shrimp', quantity: 1 }]);
    await g.update(
      "({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map((s, i) => (i === 1 ? { itemId: 'raw_shrimp', quantity: 1 } : s)) } })",
    );
    await standAt(13, 11);
    await g.tapObject('bank_booth_1');
    await g.waitFor(() => g.state('bankOpen'), { label: 'bank open' });
    await g.eval('window.__idleRpg.store.getState().bankDepositAll()');
    const inBank = await g.eval(
      `JSON.stringify(window.__idleRpg.store.getState().game.bank).includes('raw_shrimp')`,
    );
    expect(inBank && (await count('raw_shrimp')) === 0, `inBank ${inBank}`);
    return `${vp}: shrimp banked`;
  });
});
