// Idle tree sway: rotation of each visible tree's art by Animations mode, chop still works, phone frame time.
import { check, forEachViewport, withGame } from './lib.mjs';

const ART = `(id) => { const v = window.__idleRpg.scene().camera.scene.views.tree(id); if (!v) return null; const a = v.art ?? v.container.list[0]; return { a, c: v.container }; }`;
// Sample rotations of visible standing trees over `ms`; returns {n, moved, peak, nonZero}
const SAMPLE = (ms) => `(async () => {
  const ids = window.__e.treeIds, art = ${ART}, first = new Map(), peak = new Map(); let nonZero = 0;
  const end = performance.now() + ${ms};
  while (performance.now() < end) {
    for (const id of ids) { const o = art(id); if (!o || !o.c.visible || !o.c.active || !o.a.visible) continue;
      first.has(id) || first.set(id, o.a.rotation); if (o.a.rotation !== 0) nonZero++;
      peak.set(id, Math.max(peak.get(id) ?? 0, Math.abs(o.a.rotation)));
      if (Math.abs(o.a.rotation - first.get(id)) > 1e-4) first.set(id + '#m', 1); }
    await new Promise((r) => setTimeout(r, 40));
  }
  const n = peak.size; let moved = 0, pk = 0; for (const id of peak.keys()) { if (first.has(id + '#m')) moved++; pk = Math.max(pk, peak.get(id)); }
  return { n, moved, peak: pk, nonZero };
})()`;

async function setAnimations(g, label) {
  await g.tapSelector('button[aria-label="Settings"]');
  await g.waitFor(() => g.eval(`!!document.querySelector('.settings')`), {
    label: 'settings open',
  });
  const r =
    await g.eval(`(() => { const grp = [...document.querySelectorAll('[role=radiogroup]')].find((e) => document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim() === 'Animations');
    const b = [...grp.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); b.scrollIntoView({ block: 'center' });
    const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
  await g.tap(r.x, r.y);
  const mode = await g.store('s.prefs?.visuals?.animations ?? null');
  await g.closeOverlays();
  await g.sleep(300);
  return mode;
}

await withGame(
  { port: 5221 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await g.setInventory(['bronze_axe']);
    await g.teleport(48, 15);
    await g.eval(
      `(async () => { window.__e.treeIds = (await window.__e.targets()).filter((t) => t.kind === 'tree').map((t) => t.id); return window.__e.treeIds.length; })()`,
    );
    const run = async (label) => {
      await setAnimations(g, label);
      return g.eval(SAMPLE(2000));
    };
    await check('t1', 'On: most visible trees sway over 2 s', async () => {
      await setAnimations(g, 'On');
      const r = await g.eval(SAMPLE(2000));
      g.expect(r.n >= 3, `${vp}: only ${r.n} visible trees`);
      g.expect(r.moved / r.n > 0.6, `${vp}: ${r.moved}/${r.n} moved`);
      g.on = r;
      return `${vp}: ${r.moved}/${r.n} trees moved, peak ${r.peak.toFixed(4)} rad`;
    });
    await check('t2', 'Reduced: peak lean < On', async () => {
      const r = await run('Reduced');
      g.expect(r.n >= 3 && g.on, `${vp}: n=${r.n}`);
      g.expect(
        r.peak > 0 && r.peak < g.on.peak,
        `${vp}: reduced peak ${r.peak} vs on ${g.on.peak}`,
      );
      return `${vp}: reduced peak ${r.peak.toFixed(4)} < on ${g.on.peak.toFixed(4)}`;
    });
    await check('t3', 'Off: every tree at rotation 0', async () => {
      const r = await run('Off');
      g.expect(r.n >= 3, `${vp}: only ${r.n} trees`);
      g.expect(
        r.nonZero === 0 && r.peak === 0,
        `${vp}: ${r.nonZero} non-zero samples, peak ${r.peak}`,
      );
      return `${vp}: ${r.n} trees, 0 non-zero samples`;
    });
    await check('t4', 'chopping still works with sway On', async () => {
      await setAnimations(g, 'On');
      const tree = (await g.eval('window.__e.targets()'))
        .filter((t) => t.kind === 'tree')
        .sort((a, b) => Math.hypot(a.x - 48, a.y - 15) - Math.hypot(b.x - 48, b.y - 15))[0];
      await g.teleport(tree.x, tree.y + 3);
      await g.eval(
        `(() => { const art = ${ART}; window.__fell = false; const f = () => { const o = art(${JSON.stringify(tree.id)}); if (o && !o.a.visible) window.__fell = true; requestAnimationFrame(f); }; f(); })()`,
      );
      await g.tapObject(tree.id);
      await g.waitFor(async () => (await g.chatLines()).some((l) => /log/i.test(l)), {
        label: 'log chat line',
      });
      await g.waitFor(() => g.eval('window.__fell'), { label: 'tree falls' });
      const rot = await g.eval(`(${ART})(${JSON.stringify(tree.id)}).a.rotation`);
      return `${vp}: chopped ${tree.id}, tree fell, rotation after ${rot}`;
    });
    if (vp === 'phone')
      await check('t5', 'phone frame time p95 <= 17 ms, Animations On', async () => {
        await setAnimations(g, 'On');
        await g.teleport(48, 15);
        await g.realTime(async () => {});
        const d = await g.eval(
          `new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); ts.length < 300 ? requestAnimationFrame(f) : res(ts.slice(1).map((x, i) => x - ts[i])); }; requestAnimationFrame(f); })`,
        );
        const s = [...d].sort((a, b) => a - b);
        const p95 = s[Math.floor(s.length * 0.95)];
        g.expect(p95 <= 17, `p95 ${p95.toFixed(1)} ms`);
        return `${vp}: ${d.length} frames, p95 ${p95.toFixed(1)} ms, median ${s[s.length >> 1].toFixed(1)}`;
      });
  }),
);
