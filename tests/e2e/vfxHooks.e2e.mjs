// vfx hooks (runbook mining-fishing 6b-A): effects anchor at the NODE (tree/rock/spot), skill-filtered, Off = none.
// FAST BASE: desktop + phone as parallel children, 60 ms ticks. Deterministic by construction:
//  v1 chop: the swing impact comes from the animator, so the loop is frozen once the session exists and frames are
//     stepped in synthetic time (the impact lands before any real tick can fell the tree; an oak falls 1 in 8 per log);
//  v3 fishing: the spot's hop timer is parked far in the future, so it cannot hop mid-attempt;
//  v4 hop: the hop timer is set due, so the hop happens on the next tick instead of after 4-8 s.
// Run: node tests/e2e/vfxHooks.e2e.mjs  (screenshots only with SHOTS_DIR=...)
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 7865;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

// Swing-only colours (woodChips + barkFlakes): leaf/log colours are shared with the depleted/gathered effects.
const WOOD = [0x8b5a2b, 0x6b4423, 0x5a3b1e, 0x4a2f17, 0x6e4a26];
const ROCK = [0xb9aea0, 0xcfc6ba, 0x9d9388, 0x7a7068, 0x5d554f, 0x978c82];
const WATER = [0x9fd4f0, 0xd6eefb, 0x6fb6e0];
const RING = { cast: 0xcfeaf8, catch: 0xeaf6fd, rip: 0xbfe3f5, ripO: 0x8fcbe8 };
// Arc sampler: records every Arc the moment it (re)appears (position + colours). Real rAF loop for live checks; the
// same per-frame body is exposed as __vsSteps so synthetic stepping (v1) samples after EACH stepped frame.
const SAMPLER = `(() => { const w = window.__idleRpg.scene().camera.scene; window.__vs = []; window.__vsOn = true; const seen = new WeakMap(); let fr = 0;
  const frame = () => { fr++; for (const o of w.children.list) { if (o.type !== 'Arc' || !o.active || !o.visible) continue;
    const last = seen.get(o); seen.set(o, fr); if (last === fr - 1) continue;
    window.__vs.push({ f: o.isFilled ? o.fillColor : null, s: o.isStroked ? o.strokeColor : null, x: o.x, y: o.y }); } };
  window.__vsSteps = (dt, n) => { for (let i = 0; i < n; i++) { window.__e.synth.step(dt, 1); frame(); } };
  const loop = () => { if (!window.__vsOn) return; frame(); requestAnimationFrame(loop); };
  loop(); })()`;
const quiet = (g) =>
  g.waitFor(
    () =>
      g.eval(
        "window.__idleRpg.scene().camera.scene.children.list.every((o) => o.type !== 'Arc' || !o.active || !o.visible)",
      ),
    { timeoutMs: 8000, label: 'vfx quiet' },
  );
const startRec = async (g) => {
  await quiet(g);
  await g.eval(SAMPLER);
};
const stopRec = (g) => g.eval('(() => { window.__vsOn = false; return window.__vs; })()');
const world = (g, x, y) =>
  g.eval(
    `(async () => { const { isoProjection } = await import('/src/render/projection.ts'); return isoProjection.tileToWorld(${x}, ${y}); })()`,
  );
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Anchored at pt: x within r (jitter/toward offsets) and y within the lift band above it.
const near = (samples, pt, r = 22) =>
  samples.filter((s) => Math.abs(s.x - pt.x) <= r && s.y <= pt.y + 12 && s.y >= pt.y - 70).length;

await withGame(
  { port: PORT, budgetMs: BUDGET_MS },
  forEachCombo(COMBOS, async (g, vp) => {
    const J = JSON.stringify;
    const shot = async (name) => g.screenshot(`vfxHooks-${vp}-${name}`); // no-op unless SHOTS_DIR is set
    const spotTile = (id) =>
      g.eval(
        `(async () => { const R = await import('/src/app/registry.ts'); const S = window.__idleRpg.store; const sp = R.CONTENT.fishingSpots.get(${J(id)}); const i = S.getState().game.fishing.spots[${J(id)}]?.tile ?? 0; return { ...sp.tiles[i], i, tiles: sp.tiles }; })()`,
      );
    // Park / force a spot's hop timer (precondition via the store): respawnAt is the tick the spot hops at.
    const setHopAt = (id, respawnAt) =>
      g.update(
        `({ ...g, fishing: { ...g.fishing, spots: { ...g.fishing.spots, [${J(id)}]: { ...g.fishing.spots[${J(id)}], moveTimer: { ...g.fishing.spots[${J(id)}].moveTimer, respawnAt: ${respawnAt} } } } } })`,
      );
    const tapAt = async (p) => {
      expect(
        await g.eval(`window.__e.topIsCanvas(${p.x}, ${p.y})`),
        `covered at ${Math.round(p.x)},${Math.round(p.y)}`,
      );
      await g.tap(p.x, p.y);
    };

    await check(
      'v1',
      'chop: swingImpact (woodcutting, nodeId) reaches vfx; chips/bark anchor at the tree, no rock dust',
      async () => {
        await g.setInventory(['bronze_axe']);
        await g.setLevels({ woodcutting: 99 }); // oak needs 15; level 99 = first attempt lands, an oak falls only 1 in 8
        const tree = await g.targetOfKind('oak_tree');
        await g.teleportSettled(tree.x, tree.y + 2);
        await g.update('({ ...g, chat: [] })');
        await quiet(g);
        // Spy the swingImpact events that reach vfx.handleEvent (scene.vfx is private, reachable at runtime).
        await g.eval(`(() => { const sc = window.__idleRpg.scene().camera.scene; window.__swings = [];
          const orig = sc.vfx.handleEvent.bind(sc.vfx);
          sc.vfx.handleEvent = (e, c) => { if (e && e.type === 'swingImpact') window.__swings.push({ skill: e.skill, nodeId: e.nodeId }); return orig(e, c); }; })()`);
        await g.eval(SAMPLER);
        await g.setTickMs(600); // the session needs real ticks to start: slow ticks leave a long window before the first attempt
        await g.tapObject(tree.id);
        await g.waitState('gathering', `s => !!s.session && s.session.nodeId === ${J(tree.id)}`, {
          timeoutMs: 20000,
          label: `chop session on ${tree.id}`,
        });
        // The chop pose starts one tick after arrival (the walk trail must settle). Wait for it, then freeze the loop and
        // step ~3 s of frames by hand: the animator's impact fires in synthetic time, before the next real tick.
        await g.waitFor(
          () => g.eval("window.__idleRpg.scene().camera.scene.animState === 'chop'"),
          {
            timeoutMs: 20000,
            label: 'chop pose',
          },
        );
        await g.synth.freeze();
        await g.eval('window.__vsSteps(16.7, 180)');
        await g.synth.thaw();
        await g.setTickMs(60);
        const s = await stopRec(g);
        const swings = await g.eval('window.__swings');
        const mine = swings.filter((w) => w.skill === 'woodcutting' && w.nodeId === tree.id);
        expect(mine.length >= 1, `swingImpact events for ${tree.id}: ${J(swings)}`);
        const tw = await world(g, tree.x, tree.y);
        const wood = s.filter((o) => o.f !== null && WOOD.includes(o.f));
        const rock = s.filter((o) => o.f !== null && ROCK.includes(o.f));
        expect(wood.length >= 1, `wood samples ${wood.length}`);
        expect(rock.length === 0, `rock samples ${rock.length}`);
        const nearTree = near(wood, tw);
        expect(
          nearTree / wood.length >= 0.8,
          `only ${nearTree}/${wood.length} wood samples anchored at tree ${J(tw)} (samples ${J(wood.map((o) => [o.x | 0, o.y | 0]))})`,
        );
        return `${vp}: ${mine.length} swingImpact(nodeId), wood ${wood.length}, ${nearTree} near tree, rock ${rock.length}`;
      },
    );

    await check('v2', 'mine copper: rock dust/chips at the rock, no wood chips', async () => {
      await g.setInventory(['bronze_pickaxe']);
      await g.teleportSettled(73, 44);
      await g.update('({ ...g, chat: [] })');
      await startRec(g);
      await tapAt(await g.tileClient(73, 41, -12));
      await g.waitChat(/copper|ore/i, { timeoutMs: 20000 });
      await quiet(g).catch(() => {}); // let the gathered effects finish (wait on the vfx, not a fixed sleep)
      const s = await stopRec(g);
      const rw = await world(g, 73, 41);
      const rock = s.filter((o) => o.f !== null && ROCK.includes(o.f));
      const wood = s.filter((o) => o.f !== null && WOOD.includes(o.f));
      expect(rock.length >= 3, `rock samples ${rock.length}`);
      expect(wood.length === 0, `wood samples ${wood.length}`);
      const nr = near(rock, rw);
      expect(
        nr / rock.length >= 0.8,
        `only ${nr}/${rock.length} near rock ${J(rw)}; min ${Math.round(Math.min(...rock.map((o) => dist(o, rw))))}`,
      );
      await shot('rock');
      return `${vp}: rock ${rock.length}, ${nr} near rock, wood ${wood.length}`;
    });

    await check('v3', 'net fishing: cast + catch splash at the spot tile', async () => {
      await g.setInventory(['small_fishing_net']);
      await g.setMovement('running: false');
      await g.update('({ ...g, chat: [] })');
      const t = await spotTile('shore_net_1');
      await setHopAt('shore_net_1', 1e9); // the spot cannot hop mid-attempt
      await g.teleportSettled(t.x, t.y + 1);
      const castW = await world(g, t.x, t.y);
      await startRec(g);
      await tapAt(await g.tileClient(t.x, t.y, 0));
      await g.waitState('fishing', 's => !!s.session', {
        timeoutMs: 5000,
        label: 'fishing session',
      });
      await g.waitChat(/shrimp/i, { timeoutMs: 20000 });
      await quiet(g).catch(() => {});
      await shot('catch');
      const s = await stopRec(g);
      const tiles = (await spotTile('shore_net_1')).tiles;
      const tw = await Promise.all(tiles.map((q) => world(g, q.x, q.y)));
      const any = (arr, r) => arr.filter((o) => tw.some((w) => near([o], w, r) === 1)).length;
      const sp = s.filter((o) => o.f !== null && WATER.includes(o.f));
      const rings = s.filter((o) => o.s === RING.cast);
      const crings = s.filter((o) => o.s === RING.catch);
      expect(
        sp.length >= 5 && rings.length >= 1 && crings.length >= 1,
        `splash ${sp.length}, cast rings ${rings.length}, catch rings ${crings.length}`,
      );
      const ns = any(sp, 22);
      const nc = any(rings, 6);
      const ncc = any(crings, 6);
      expect(
        ns === sp.length && nc === rings.length && ncc === crings.length,
        `at a spot tile: splash ${ns}/${sp.length}, cast ring ${nc}/${rings.length}, catch ring ${ncc}/${crings.length} (cast tile world ${J(castW)})`,
      );
      return `${vp}: splash ${sp.length} (${ns} at spot), cast ring ${rings.length}, catch ring ${crings.length}`;
    });

    await check(
      'v4',
      'spot hop: ripples at both the from and the to tile (all 4 spots hopping at once)',
      async () => {
        // The world has 4 spots whose hops can overlap (4 rings each = 16): the ring pool must hold them all (24 desktop /
        // 16 phone; the old 8 / 6 recycled the earliest ends mid-ripple). All four are made due on the same tick.
        const IDS = ['shore_net_1', 'shore_bait_1', 'shore_net_2', 'shore_bait_2'];
        await g.setInventory(['small_fishing_net']);
        await g.teleportSettled(40, 50);
        await startRec(g);
        const before = await Promise.all(IDS.map((id) => spotTile(id)));
        for (const id of IDS) await setHopAt(id, 0); // due now: the real spotMoved events fire on the next tick
        let after = before;
        await g.waitFor(
          async () =>
            (after = await Promise.all(IDS.map((id) => spotTile(id)))).every(
              (t, i) => t.i !== before[i].i,
            ),
          { timeoutMs: 10000, label: 'all 4 spots hopped' },
        );
        const ends = await Promise.all(
          IDS.map(async (id, i) => ({
            id,
            a: await world(g, before[i].x, before[i].y),
            b: await world(g, after[i].x, after[i].y),
          })),
        );
        const ripSamples = async () =>
          (await g.eval('window.__vs')).filter((o) => o.s === RING.rip || o.s === RING.ripO);
        const counts = (rip) =>
          ends.map((e) => ({ id: e.id, from: near(rip, e.a, 12), to: near(rip, e.b, 12) }));
        // wait for the ripple effects to appear (state, not a sleep); the assertion below still decides pass/fail
        await g
          .waitFor(async () => counts(await ripSamples()).every((c) => c.from > 0 && c.to > 0), {
            timeoutMs: 2500,
            label: 'ripples at every end',
          })
          .catch(() => {});
        const s = await stopRec(g);
        const rip = s.filter((o) => o.s === RING.rip || o.s === RING.ripO);
        const c = counts(rip);
        const miss = c.filter((x) => !(x.from > 0 && x.to > 0));
        expect(
          miss.length === 0,
          `no ripple at both ends of ${J(miss)}; per spot ${J(c)}; total ${rip.length} vp ${J(await g.eval('[innerWidth, innerHeight]'))}`,
        );
        await shot('ripples-to');
        return `${vp}: ${IDS.length} spots hopped, ripple samples per spot (from/to) ${c.map((x) => `${x.from}/${x.to}`).join(' ')}; total ${rip.length}`;
      },
    );

    await check('v5', 'Effects Off: no particles on chop', async () => {
      await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'off' } })`);
      await g.setInventory(['bronze_axe']);
      await g.setLevels({ woodcutting: 20 });
      const tree =
        (await g.targets()).filter((o) => o.kind === 'tree')[1] ?? (await g.targetOfKind('tree'));
      await g.teleportSettled(tree.x, tree.y + 3);
      await g.update('({ ...g, chat: [] })');
      await startRec(g);
      await g.tapObject(tree.id);
      await g.waitChat(/log/i, { timeoutMs: 15000 });
      await g.waitTicks(4); // effects, had they been on, would be live by now
      const s = await stopRec(g);
      await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on' } })`);
      expect(s.length === 0, `${s.length} arc samples while Off`);
      return `${vp}: 0 samples while Off`;
    });
  }),
);
