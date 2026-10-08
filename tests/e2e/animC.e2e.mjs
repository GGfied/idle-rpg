// Gathering poses: mine (pick), net fishing, rod fishing (+ rod catch pulse). Run: node tests/e2e/animC.e2e.mjs (port 5261)
import { check, expect, forEachViewport, withGame } from './lib.mjs';

process.env.SHOTS_DIR ??= new URL('./.shots-animC', import.meta.url).pathname;
const S = 'window.__idleRpg.store.getState()';
const INSTALL = `(() => { const sc = window.__idleRpg.scene().camera.scene; const pv = sc.player;
  const all = (o, out = []) => { out.push(o); (o.list || []).forEach((c) => all(c, out)); return out; };
  const vis = (o) => { for (let p = o; p; p = p.parentContainer) if (!p.visible) return false; return true; };
  const find = (n) => all(pv.container).filter((o) => o.name === n);
  window.__rig = { sc, find, vis,
    snap: (n) => { const gs = find(n); const v = gs.filter(vis); return { n: gs.length, v: v.length, back: v.some((o) => o.parentContainer === pv.container.list[0]) }; },
    vec: (n, x0, y0, x1, y1) => { const o = find(n).find(vis); if (!o) return null; const m = o.getWorldTransformMatrix(); const a = m.transformPoint(x0, y0), b = m.transformPoint(x1, y1); return { dx: b.x - a.x, dy: b.y - a.y }; },
    armsVisible: () => find('armFrontUpper').some(vis) };
  window.__pulses = 0; window.__impacts = []; const a = sc.animator; if (!a.__i) { a.__i = true; const oi = a.onImpact; a.onImpact = (...x) => { window.__impacts.push(window.__rig.vec('pick', 0, 0, 0, 11)); return oi?.(...x); }; } if (!a.__w) { a.__w = true; const p = a.pulse.bind(a); a.pulse = (...x) => { window.__pulses++; return p(...x); }; } })()`;
const SAMPLE = (ms, fn) =>
  `new Promise((res) => { const out = []; const t0 = performance.now(); const f = () => { out.push((${fn})()); if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res(out); }; f(); })`;
const clip = async (g, name) => {
  const p = await g.eval(
    `(() => { const c = window.__idleRpg.scene().camera.scene.player.container; return window.__e.toClient(c.x, c.y - 20); })()`,
  );
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 50), y: Math.max(0, p.y - 70), width: 100, height: 110, scale: 4 },
  });
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
  fs.writeFileSync(
    `${process.env.SHOTS_DIR}/${g.vp ?? g.viewportName}-${name}.png`,
    Buffer.from(data, 'base64'),
  );
};
const burst = async (g, name, vecExpr, n) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const pre = await g.eval(`(() => ({ a: __rig.sc.animState, p: __pulses, v: ${vecExpr} }))()`);
    const k = `${name}-${i}`;
    await clip(g, k);
    rows.push({
      k,
      ...pre,
      d: pre.v ? +(pre.v.dy / Math.hypot(pre.v.dx, pre.v.dy)).toFixed(2) : null,
    });
    await g.sleep(60);
  }
  process.stdout.write(
    `BURST ${g.vp ?? g.viewportName} ${name} ${JSON.stringify(rows.map((r) => [r.k, r.a, r.p, r.d]))}\n`,
  );
  return rows;
};
const spotTile = (id) =>
  g0.eval(
    `(async () => { const R = await import('/src/app/registry.ts'); const sp = R.CONTENT.fishingSpots.get(${JSON.stringify(id)}); return sp.tiles[${S}.game.fishing.spots[${JSON.stringify(id)}]?.tile ?? 0]; })()`,
  );
let g0;
const startFish = async (g, id, tools, lvl, slow) => {
  g0 = g;
  await g.setLevel('fishing', lvl);
  await g.setInventory(tools);
  const t = await spotTile(id);
  await g.teleport(t.x, t.y + 1);
  await g.eval(`${S}.interactSpot(${JSON.stringify(id)})`);
  await g.waitFor(async () => (await g.state('fishing.session')) !== null, {
    label: 'fishing session',
  });
  await g.eval(INSTALL);
  await g.eval(
    `window.__idleRpg.setTickMs(${slow ? 600 : 60}); clearInterval(window.__kf); window.__kf = ${slow ? 'null' : `setInterval(() => { const st = ${S}; if (!st.game.fishing.session && !st.game.pendingFishing) st.interactSpot(${JSON.stringify(id)}); }, 120)`}`,
  );
  return t;
};
const rawCount = (g) =>
  g.eval(
    `window.__idleRpg.store.getState().game.inventory.slots.filter((s) => s && s.itemId.startsWith('raw_')).reduce((n, s) => n + s.quantity, 0)`,
  );
const stop = async (g) => {
  await g.eval('clearInterval(window.__kf); window.__idleRpg.setTickMs(60)');
  await g.eval(
    `${S}.walkTo({ x: ${S}.game.movement.position.x + 2, y: ${S}.game.movement.position.y })`,
  );
  await g.sleep(500);
};

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5267) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g0 = g;
    g.vp = vp;
    const ROCK = { id: 'quarry_copper_1', x: 73, y: 41 };
    const mineAt = async (back) => {
      await g.eval('window.__idleRpg.setTickMs(600)');
      await g.setInventory(['bronze_pickaxe']);
      const offs =
        await g.eval(`(async () => { const A = await import('/src/render/animation/index.ts'); const o = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) { const b = A.facingIsBack(A.facingFromStep(-dx, -dy)); if (b === ${back}) o.push([dx, dy]); } return o; })()`);
      for (const [dx, dy] of offs) {
        await g.teleport(ROCK.x + dx, ROCK.y + dy);
        const p = await g.state('movement.position');
        if (p.x !== ROCK.x + dx || p.y !== ROCK.y + dy) continue;
        await g.eval(`${S}.interactTree(${JSON.stringify(ROCK.id)})`);
        try {
          await g.waitFor(async () => (await g.state('gathering.session')) !== null, {
            timeoutMs: 4000,
            label: 'mine session',
          });
        } catch {
          continue;
        }
        await g.eval(INSTALL);
        return [dx, dy];
      }
      throw new Error('no usable neighbour for back=' + back);
    };
    await check(
      'm1',
      'mine (front): state mine, pick visible, tip down at impact, arms shown',
      async () => {
        const o = await mineAt(false);
        await g.eval(
          `clearInterval(window.__mk); window.__mk = setInterval(() => { const st = ${S}; if (!st.game.gathering.session) st.interactTree(${JSON.stringify(ROCK.id)}); }, 300)`,
        );
        await g.sleep(300);
        const s = await g.eval(
          SAMPLE(
            2600,
            `() => ({ a: __rig.sc.animState, pick: __rig.snap('pick'), arms: __rig.armsVisible(), v: __rig.vec('pick', 0, 0, 0, 11) })`,
          ),
        );
        const mine = s.filter((x) => x.a === 'mine');
        expect(mine.length > 20, `mine frames ${mine.length}/${s.length}`);
        expect(
          mine.every((x) => x.pick.v === 1 && !x.pick.back && x.arms),
          `pick/arms ${JSON.stringify(mine[0])}`,
        );
        await g.waitFor(async () => (await g.eval('window.__impacts.length')) >= 1, {
          timeoutMs: 15000,
          label: 'impact',
        });
        const imp = await g.eval('window.__impacts');
        const down = Math.max(...imp.filter(Boolean).map((v) => v.dy / Math.hypot(v.dx, v.dy)), -1);
        expect(
          imp.length >= 1 && down > 0.3,
          `impacts ${imp.length} downward component of haft->head ${down.toFixed(2)} ${JSON.stringify(imp.slice(0, 3))}`,
        );
        await g.eval('clearInterval(window.__mk)');
        return `off ${o} frames ${mine.length} maxDown ${down.toFixed(2)}`;
      },
    );
    await g.eval('clearInterval(window.__mk)');
    await check('m1b', 'mine close-ups: wind-up -> impact captured while state mine', async () => {
      await mineAt(false);
      const rows = await burst(g, 'mine-front', "__rig.vec('pick', 0, 0, 0, 11)", 14);
      const d = rows.filter((r) => r.a === 'mine' && r.d !== null).map((r) => r.d);
      expect(d.length >= 6, `mine shots ${d.length}`);
      return `mine shots ${d.length} pick down-component ${Math.min(...d)}..${Math.max(...d)}`;
    });
    await check('m2', 'mine (back view): arms hidden, pick in back layer', async () => {
      const o = await mineAt(true);
      await g.sleep(300);
      const s = await g.eval(
        SAMPLE(
          2000,
          `() => ({ a: __rig.sc.animState, f: __rig.sc.facing, pick: __rig.snap('pick'), arms: __rig.armsVisible() })`,
        ),
      );
      const mine = s.filter((x) => x.a === 'mine');
      expect(mine.length > 20, `mine frames ${mine.length} facing ${s[0].f}`);
      expect(
        mine.every((x) => x.pick.v === 1 && x.pick.back && !x.arms),
        `back ${JSON.stringify(mine[0])}`,
      );
      await clip(g, 'mine-back');
      return `off ${o} facing ${s[0].f} frames ${mine.length}`;
    });
    await check('m3', 'stopping mining returns to idle/walk, pick hidden', async () => {
      await stop(g);
      const s = await g.eval(`({ a: __rig.sc.animState, p: __rig.snap('pick') })`);
      expect(s.a !== 'mine' && s.p.v === 0, JSON.stringify(s));
      return JSON.stringify(s);
    });
    await check(
      'n1',
      'net fishing: fishNet + net visible, cast/haul loops, stop -> idle',
      async () => {
        await startFish(g, 'shore_net_1', ['small_fishing_net'], 1, true);
        await g.sleep(500);
        const s = await g.eval(
          SAMPLE(
            4500,
            `() => ({ a: __rig.sc.animState, net: __rig.snap('net').v, rod: __rig.snap('rod').v, y: __rig.vec('net', 0, 0, 0, 14) })`,
          ),
        );
        const f = s.filter((x) => x.a === 'fishNet');
        expect(
          f.length > 30 && f.every((x) => x.net === 1 && x.rod === 0),
          `frames ${f.length}/${s.length}`,
        );
        const ys = f.filter((x) => x.y).map((x) => x.y.dy);
        const range = Math.max(...ys) - Math.min(...ys);
        expect(range > 4, `net haft dy range ${range.toFixed(1)} (cast/haul motion)`);
        await burst(g, 'net', "__rig.vec('net', 0, 0, 0, 14)", 10);
        await stop(g);
        const e = await g.eval(`({ a: __rig.sc.animState, n: __rig.snap('net').v })`);
        expect(e.a !== 'fishNet' && e.n === 0, JSON.stringify(e));
        return `frames ${f.length} range ${range.toFixed(1)} end ${e.a}`;
      },
    );
    await check('n2', 'net catches never pulse', async () => {
      await startFish(g, 'shore_net_1', ['small_fishing_net'], 1);
      const r0 = await rawCount(g);
      await g.waitFor(async () => (await rawCount(g)) - r0 >= 3, {
        timeoutMs: 40000,
        label: 'net catches',
      });
      const pulses = await g.eval('window.__pulses');
      expect(pulses === 0, `pulses ${pulses} after ${(await rawCount(g)) - r0} net catches`);
      await stop(g);
      return `pulses 0 over ${(await rawCount(g)) - r0} catches`;
    });
    await check('r1', 'rod fishing: fishRod, rod+rodLine visible, line upright', async () => {
      await startFish(
        g,
        'shore_bait_1',
        ['fishing_rod', { itemId: 'fishing_bait', quantity: 500 }],
        5,
        true,
      );
      await g.sleep(500);
      const s = await g.eval(
        SAMPLE(
          3500,
          `() => ({ a: __rig.sc.animState, rod: __rig.snap('rod').v, line: __rig.snap('rodLine').v, net: __rig.snap('net').v, l: __rig.vec('rodLine', 0, 0, 0, 11) })`,
        ),
      );
      const f = s.filter((x) => x.a === 'fishRod');
      expect(
        f.length > 30 && f.every((x) => x.rod === 1 && x.line === 1 && x.net === 0),
        `frames ${f.length}/${s.length} ${JSON.stringify(f[0])}`,
      );
      const up = Math.min(...f.filter((x) => x.l).map((x) => x.l.dy / Math.hypot(x.l.dx, x.l.dy)));
      expect(up > 0.97, `min line downward component ${up.toFixed(3)} (upright = 1)`);
      await burst(g, 'rod', "__rig.vec('rodLine', 0, 0, 0, 11)", 6);
      return `frames ${f.length} lineUpright ${up.toFixed(3)}`;
    });
    await check('r2', 'rod: exactly one pulse per catch, none on a miss', async () => {
      await stop(g);
      await startFish(
        g,
        'shore_bait_1',
        ['fishing_rod', { itemId: 'fishing_bait', quantity: 500 }],
        5,
      );
      const r0 = await rawCount(g);
      await g.eval('window.__idleRpg.setTickMs(600)');
      const p0 = await g.eval('window.__pulses');
      await g.waitFor(async () => (await g.eval('window.__pulses')) > p0, {
        timeoutMs: 60000,
        label: 'first pulse',
      });
      await burst(g, 'rod-catch', "__rig.vec('rodLine', 0, 0, 0, 11)", 5);
      await g.eval('window.__idleRpg.setTickMs(60)');
      await g.waitFor(async () => (await rawCount(g)) - r0 >= 4, {
        timeoutMs: 60000,
        label: 'rod catches',
      });
      await g.sleep(100);
      const c = (await rawCount(g)) - r0;
      const p = await g.eval('window.__pulses');
      expect(c >= 4 && p === c, `pulses ${p} vs catches ${c}`);
      return `pulses ${p} == catches ${c}`;
    });
    await check('r3', 'rod stop -> idle; chop still plays chop; no net/rod left', async () => {
      await stop(g);
      const e = await g.eval(
        `({ a: __rig.sc.animState, rod: __rig.snap('rod').v, line: __rig.snap('rodLine').v })`,
      );
      expect(e.a !== 'fishRod' && e.rod === 0 && e.line === 0, JSON.stringify(e));
      await g.setInventory(['bronze_axe']);
      const tree = await g.targetOfKind('tree');
      await g.teleport(tree.x, tree.y + 2);
      await g.eval(`${S}.interactTree(${JSON.stringify(tree.id)})`);
      let seen;
      await g.waitFor(
        async () =>
          (seen = await g.eval(`({ a: __rig.sc.animState, axe: __rig.snap('axe').v })`)).a ===
          'chop',
        { label: 'chop' },
      );
      expect(seen.axe === 1, JSON.stringify(seen));
      return `idle ${e.a}; chop ${JSON.stringify(seen)}`;
    });
  }),
);
