// Realistic tree art: tree_* textures + variants, oak art, stump/respawn textures, canopy+trunk taps still chop.
import { check, forEachViewport, withGame } from './lib.mjs';

const VIEW = (id) => `window.__idleRpg.scene().camera.scene.views.tree(${JSON.stringify(id)})`;
const KEYS = (id) =>
  `(() => { const v = ${VIEW(id)}; if (!v) return null; const l = v.container.list; return { full: l[0].texture.key, stump: l[1].texture.key, fullVis: l[0].visible, stumpVis: l[1].visible }; })()`;

await withGame(
  { port: 5197 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.setInventory(['bronze_axe']);
    await g.setLevel('woodcutting', 30);
    const all = await g.targets();
    const trees = all.filter((t) => t.kind === 'tree');
    const oaks = all.filter((t) => t.kind === 'oak_tree');
    const keysAt = async (list) => {
      const out = [];
      for (const t of list) {
        await g.teleport(t.x, t.y + 2, { settleMs: 120 });
        out.push({ id: t.id, ...(await g.eval(KEYS(t.id))) });
      }
      return out;
    };
    const nearStart = trees.filter((t) => t.x < 40 && t.y < 30).slice(0, 12);
    const wood = trees.filter((t) => t.x >= 40 && t.y <= 25).slice(0, 12);

    await check('t1', 'start area + Whispering Wood trees use tree_* art, >1 variant', async () => {
      const a = await keysAt(nearStart);
      const b = await keysAt(wood);
      const rows = [...a, ...b];
      g.expect(a.length >= 3 && b.length >= 3, `${vp}: few trees ${a.length}/${b.length}`);
      const bad = rows.filter(
        (r) => !r.full || !/^tree_tree_\d+$/.test(r.full) || !/_stump$/.test(r.stump),
      );
      g.expect(bad.length === 0, `${vp}: bad keys ${JSON.stringify(bad.slice(0, 3))}`);
      const vs = new Set(rows.map((r) => r.full));
      g.expect(vs.size > 1, `${vp}: only variants ${[...vs]}`);
      await g.teleport(nearStart[0].x, nearStart[0].y + 3);
      await g.screenshot(`trees-${vp}-standing`);
      return `${vp}: ${rows.length} trees ok, variants ${[...vs].join(',')}`;
    });

    await check('t2', 'oak trees use their own art', async () => {
      g.expect(oaks.length > 0, 'no oaks');
      const r = await keysAt(oaks);
      const bad = r.filter(
        (x) => !/^tree_oak_tree_\d+$/.test(x.full) || !/^tree_oak_tree_\d+_stump$/.test(x.stump),
      );
      g.expect(bad.length === 0, `${vp}: ${JSON.stringify(bad.slice(0, 3))}`);
      await g.teleport(oaks[0].x, oaks[0].y + 3);
      await g.screenshot(`trees-${vp}-oak`);
      return `${vp}: ${r.length} oaks, e.g. ${r[0].full}`;
    });

    await check('t3', 'chop -> stump texture, then standing art after respawn', async () => {
      const t = nearStart[0];
      await g.teleport(t.x, t.y + 3);
      const before = await g.eval(KEYS(t.id));
      await g.eval(
        `(() => { window.__log = []; const f = () => { const v = ${VIEW(t.id)}; if (v) { const l = v.container.list; const s = (l[1].visible ? 'S:' + l[1].texture.key : '') + (l[0].visible ? 'F:' + l[0].texture.key : ''); const a = window.__log; if (a[a.length - 1] !== s) a.push(s); } requestAnimationFrame(f); }; f(); })()`,
      );
      await g.tapObject(t.id);
      await g.waitFor(async () => (await g.eval('window.__log')).some((s) => s.startsWith('S:')), {
        label: 'stump shown',
      });
      await g.waitFor(
        async () => {
          const l = await g.eval('window.__log');
          return l[l.length - 1]?.startsWith('F:') && l.some((s) => s.startsWith('S:'));
        },
        { label: 'respawn' },
      );
      const log = await g.eval('window.__log');
      const stumps = log.filter((s) => s.startsWith('S:'));
      g.expect(
        stumps.every((s) => s === 'S:' + before.stump),
        `${vp}: stump keys ${stumps}`,
      );
      g.expect(
        log[log.length - 1] === 'F:' + before.full,
        `${vp}: after ${log[log.length - 1]} vs ${before.full}`,
      );
      // stump screenshot: fell the tree again and capture while depleted
      return `${vp}: sequence ${JSON.stringify(log)}`;
    });

    await check('t3b', 'stump screenshot', async () => {
      const t = nearStart[0];
      await g.teleport(t.x, t.y + 2);
      await g.eval('window.__idleRpg.setTickMs(600)');
      await g.tapObject(t.id);
      await g.waitFor(() => g.eval(`${VIEW(t.id)}.container.list[1].visible`), {
        label: 'stump',
        timeoutMs: 20000,
      });
      await g.sleep(500);
      const f = await g.screenshot(`trees-${vp}-stump`);
      await g.eval('window.__idleRpg.setTickMs(60)');
      return `${vp}: ${f}`;
    });

    await check('t4', 'tap canopy and trunk both chop', async () => {
      const t = nearStart[1];
      await g.teleport(t.x, t.y + 2);
      const res = [];
      for (const [name, f] of [
        ['canopy', 0.8],
        ['trunk', 0.12],
      ]) {
        await g.waitFor(() => g.eval(`${VIEW(t.id)}.container.list[0].visible`), {
          label: 'standing',
        });
        const n0 = await g.chatCount('log');
        await g.teleport(t.x, t.y + 2, { settleMs: 300 });
        const p = await g.tileClient(t.x, t.y, -t.up * f);
        g.expect(await g.page(`topIsCanvas(${p.x}, ${p.y})`), `${vp}: ${name} covered`);
        await g.tap(p.x, p.y);
        await g.waitFor(async () => (await g.chatCount('log')) > n0, { label: `${name} log` });
        res.push(`${name}@dy-${Math.round(t.up * f)}`);
      }
      return `${vp}: ${res.join(', ')} each gave a log`;
    });

    await check('t6', '0 console errors', async () => {
      g.expect(g.errors.length === 0, g.errors.join(' | '));
      return `${vp}: 0 errors`;
    });
  }),
);
