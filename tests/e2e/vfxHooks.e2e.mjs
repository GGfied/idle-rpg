// vfx hooks (runbook mining-fishing 6b-A): effects anchor at the NODE (tree/rock/spot), skill-filtered, Off = none.
// Run: node tests/e2e/vfxHooks.e2e.mjs  (port 5246, E2E_PORT overrides; shots in tests/e2e/.shots-vfxA)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '.shots-vfxA');
// Swing-only colours (woodChips + barkFlakes): leaf/log colours are shared with the depleted/gathered effects.
const WOOD = [0x8b5a2b, 0x6b4423, 0x5a3b1e, 0x4a2f17, 0x6e4a26];
const ROCK = [0xb9aea0, 0xcfc6ba, 0x9d9388, 0x7a7068, 0x5d554f, 0x978c82];
const WATER = [0x9fd4f0, 0xd6eefb, 0x6fb6e0];
const RING = { cast: 0xcfeaf8, catch: 0xeaf6fd, rip: 0xbfe3f5, ripO: 0x8fcbe8 };
const SAMPLER = `(() => { const w = window.__idleRpg.scene().camera.scene; window.__vs = []; window.__vsOn = true; const seen = new WeakMap(); let fr = 0;
  const loop = () => { if (!window.__vsOn) return; fr++; for (const o of w.children.list) { if (o.type !== 'Arc' || !o.active || !o.visible) continue;
    const last = seen.get(o); seen.set(o, fr); if (last === fr - 1) continue;
    window.__vs.push({ f: o.isFilled ? o.fillColor : null, s: o.isStroked ? o.strokeColor : null, x: o.x, y: o.y }); } requestAnimationFrame(loop); };
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
  { port: 5246 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    const J = JSON.stringify;
    const shot = async (name, wx, wy) => {
      const p = await g.eval(`window.__e.toClient(${wx}, ${wy})`);
      const { data } = await g.cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, p.x - 60),
          y: Math.max(0, p.y - 80),
          width: 120,
          height: 110,
          scale: 4,
        },
      });
      mkdirSync(SHOTS, { recursive: true });
      writeFileSync(resolve(SHOTS, `${vp}-${name}.png`), Buffer.from(data, 'base64'));
    };
    const spotTile = (id) =>
      g.eval(
        `(async () => { const R = await import('/src/app/registry.ts'); const S = window.__idleRpg.store; const sp = R.CONTENT.fishingSpots.get(${J(id)}); const i = S.getState().game.fishing.spots[${J(id)}]?.tile ?? 0; return { ...sp.tiles[i], i, tiles: sp.tiles }; })()`,
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
        const tree = await g.targetOfKind('tree');
        await g.teleport(tree.x, tree.y + 3);
        await g.update('({ ...g, chat: [] })');
        await quiet(g);
        // Spy the swingImpact events that reach vfx.handleEvent (scene.vfx is private, reachable at runtime).
        await g.eval(`(() => { const sc = window.__idleRpg.scene().camera.scene; window.__swings = [];
          const orig = sc.vfx.handleEvent.bind(sc.vfx);
          sc.vfx.handleEvent = (e, c) => { if (e && e.type === 'swingImpact') window.__swings.push({ skill: e.skill, nodeId: e.nodeId }); return orig(e, c); }; })()`);
        await startRec(g);
        // Real 600 ms ticks: the swing impact lands before the tree falls.
        await g.realTime(async () => {
          await g.tapObject(tree.id);
          await g.waitFor(async () => (await g.chatLines()).some((l) => /log/i.test(l)), {
            label: 'log',
            timeoutMs: 30000,
          });
          await g.sleep(150);
        });
        const s = await stopRec(g);
        const swings = await g.eval('window.__swings');
        const mine = swings.filter((w) => w.skill === 'woodcutting' && w.nodeId === tree.id);
        expect(mine.length >= 1, `swingImpact events for ${tree.id}: ${JSON.stringify(swings)}`);
        const tw = await world(g, tree.x, tree.y);
        const wood = s.filter((o) => o.f !== null && WOOD.includes(o.f));
        const rock = s.filter((o) => o.f !== null && ROCK.includes(o.f));
        expect(wood.length >= 1, `wood samples ${wood.length}`);
        expect(rock.length === 0, `rock samples ${rock.length}`);
        const nearTree = near(wood, tw);
        expect(
          nearTree / wood.length >= 0.8,
          `only ${nearTree}/${wood.length} wood samples anchored at tree ${JSON.stringify(tw)} (samples ${JSON.stringify(wood.map((o) => [o.x | 0, o.y | 0]))})`,
        );
        return `${vp}: ${mine.length} swingImpact(nodeId), wood ${wood.length}, ${nearTree} near tree, rock ${rock.length}`;
      },
    );

    await check('v2', 'mine copper: rock dust/chips at the rock, no wood chips', async () => {
      await g.setInventory(['bronze_pickaxe']);
      await g.teleport(73, 44);
      await g.update('({ ...g, chat: [] })');
      await startRec(g);
      await tapAt(await g.tileClient(73, 41, -12));
      await g.waitFor(async () => (await g.chatLines()).some((l) => /copper|ore/i.test(l)), {
        label: 'ore line',
        timeoutMs: 20000,
      });
      await g.sleep(250);
      const s = await stopRec(g);
      const rw = await world(g, 73, 41);
      const rock = s.filter((o) => o.f !== null && ROCK.includes(o.f));
      const wood = s.filter((o) => o.f !== null && WOOD.includes(o.f));
      expect(rock.length >= 3, `rock samples ${rock.length}`);
      expect(wood.length === 0, `wood samples ${wood.length}`);
      const nr = near(rock, rw);
      expect(
        nr / rock.length >= 0.8,
        `only ${nr}/${rock.length} near rock ${JSON.stringify(rw)}; min ${Math.round(Math.min(...rock.map((o) => dist(o, rw))))}`,
      );
      await shot('rock', rw.x, rw.y);
      return `${vp}: rock ${rock.length}, ${nr} near rock, wood ${wood.length}`;
    });

    await check('v3', 'net fishing: cast + catch splash at the spot tile', async () => {
      await g.setInventory(['small_fishing_net']);
      await g.setMovement('running: false');
      await g.update('({ ...g, chat: [] })');
      await startRec(g);
      let caught = false;
      let castW = null;
      for (let i = 0; i < 4 && !caught; i++) {
        // The spot can hop mid-attempt (60 ms ticks): re-read its tile every try.
        const t = await spotTile('shore_net_1');
        await g.teleport(t.x, t.y + 1);
        const t2 = await spotTile('shore_net_1');
        if (t2.i !== t.i) continue;
        castW = await world(g, t.x, t.y);
        await tapAt(await g.tileClient(t.x, t.y, 0));
        const started = await g
          .waitFor(async () => !!(await g.state('fishing.session')), {
            timeoutMs: 3000,
            label: 'session',
          })
          .then(
            () => true,
            () => false,
          );
        if (!started) continue;
        await g.sleep(250);
        if (i === 0 || !caught) await shot('cast', castW.x, castW.y);
        caught = await g
          .waitFor(async () => (await g.chatLines()).some((l) => /shrimp/i.test(l)), {
            timeoutMs: 6000,
            label: 'catch',
          })
          .then(
            () => true,
            () => false,
          );
      }
      expect(caught, 'never caught a shrimp in 4 attempts');
      await g.sleep(100);
      await shot('catch', castW.x, castW.y);
      const s = await stopRec(g);
      const tiles = (await spotTile('shore_net_1')).tiles;
      const tw = await Promise.all(tiles.map((t) => world(g, t.x, t.y)));
      const any = (arr, r) => arr.filter((o) => tw.some((w) => near([o], w, r) === 1)).length;
      const sp = s.filter((o) => o.f !== null && WATER.includes(o.f));
      const rings = s.filter((o) => o.s === RING.cast);
      const crings = s.filter((o) => o.s === RING.catch);
      expect(
        sp.length >= 5 && rings.length >= 1 && crings.length >= 1,
        `splash ${sp.length}, cast rings ${rings.length}, catch rings ${crings.length}`,
      );
      const ns = any(sp, 22),
        nc = any(rings, 6),
        ncc = any(crings, 6);
      expect(
        ns === sp.length && nc === rings.length && ncc === crings.length,
        `at a spot tile: splash ${ns}/${sp.length}, cast ring ${nc}/${rings.length}, catch ring ${ncc}/${crings.length}`,
      );
      return `${vp}: splash ${sp.length} (${ns} at spot), cast ring ${rings.length}, catch ring ${crings.length}`;
    });

    await check('v4', 'spot hop: ripples at both the from and the to tile', async () => {
      await g.setInventory(['small_fishing_net']);
      await g.teleport(40, 50);
      await startRec(g);
      const t0 = await spotTile('shore_net_2');
      let t1 = t0;
      await g.waitFor(async () => (t1 = await spotTile('shore_net_2')).i !== t0.i, {
        timeoutMs: 25000,
        label: 'hop',
      });
      await g.sleep(150);
      const s = await stopRec(g);
      const a = await world(g, t0.x, t0.y),
        b = await world(g, t1.x, t1.y);
      const rip = s.filter((o) => o.s === RING.rip || o.s === RING.ripO);
      const na = near(rip, a, 12),
        nb = near(rip, b, 12);
      expect(
        na > 0 && nb > 0,
        `ripples at from ${na}, at to ${nb} (total ${rip.length}) from ${JSON.stringify(a)} to ${JSON.stringify(b)}`,
      );
      await g.teleport(t1.x, t1.y + 1);
      await shot('ripples-to', b.x, b.y);
      return `${vp}: tile ${t0.x},${t0.y} -> ${t1.x},${t1.y}; ripple samples from ${na}, to ${nb}`;
    });

    await check('v5', 'Effects Off: no particles on chop', async () => {
      await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'off' } })`);
      await g.sleep(200);
      await g.setInventory(['bronze_axe']);
      const tree =
        (await g.targets()).filter((o) => o.kind === 'tree')[1] ?? (await g.targetOfKind('tree'));
      await g.teleport(tree.x, tree.y + 3);
      await g.update('({ ...g, chat: [] })');
      await startRec(g);
      await g.tapObject(tree.id);
      await g.waitFor(async () => (await g.chatLines()).some((l) => /log/i.test(l)), {
        label: 'log',
      });
      await g.sleep(300);
      const s = await stopRec(g);
      await g.eval(`window.__idleRpg.store.getState().setPref({ visuals: { vfx: 'on' } })`);
      expect(s.length === 0, `${s.length} arc samples while Off`);
      return `${vp}: 0 samples while Off`;
    });
  }),
);
