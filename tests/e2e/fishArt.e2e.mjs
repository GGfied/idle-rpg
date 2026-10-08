// Fishing-spot fish art as a player sees it: dark fish silhouettes against water/foam, net school moves,
// bait fish jumps with a splash within one loop (~3.4 s). WebGL and CANVAS renderers, desktop + phone.
// Deterministic: the Phaser loop is frozen (g.synth) and stepped by art frames (loop/24 ms), ONE clip screenshot per
// stepped frame, so no wall-clock sampling. Fast base: 4 parallel combos (desktop/phone x webgl/canvas), budget 60 s.
// Run: node tests/e2e/fishArt.e2e.mjs   (SHOTS_DIR default tests/e2e/.shots-fish)
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9211; // C5 port block 9201-9250; 4 combos use 9211-9214
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'], // the art is the subject: both renderers
  budgetMs: BUDGET_MS,
});
const SHOTS =
  process.env.SHOTS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '.shots-fish');
// per-frame counts inside a clip: dark navy fish pixels (+ their centroid), pure white splash/foam pixels
const ANALYSE = `window.__fa = async (list) => { const out = [];
  for (const b64 of list) { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
    const d = x.getImageData(0, 0, bm.width, bm.height).data; let dark = 0, white = 0, sx = 0, sy = 0, ymin = 1e9;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], p = i / 4;
      if (r + g + b < 140 && b >= r) { dark++; if (Math.floor(p / bm.width) < ymin) ymin = Math.floor(p / bm.width); sx += p % bm.width; sy += Math.floor(p / bm.width); }
      else if (r > 235 && g > 240 && b > 240) white++; }
    const n = d.length / 4; out.push({ dark: (dark * 1000) / n, white: (white * 1000) / n, cx: dark ? sx / dark / bm.width : -1, cy: dark ? sy / dark / bm.height : -1, top: dark ? ymin / bm.height : -1 }); }
  return out; };`;
const SPOTS = { net: 'shore_net_1', bait: 'shore_bait_1' };
const LOOP_MS = 3360; // NODE_IDLE.spotLoopMs: 24 art frames, 140 ms each
const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
const range = (a) => Math.max(...a) - Math.min(...a);

async function spotTile(g, id) {
  return JSON.parse(
    await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const { spotTile } = await import('/src/app/game/fishingSpots.ts');
      const t = spotTile(CONTENT.fishingSpots.get(${JSON.stringify(id)}), window.__e.game().fishing); return JSON.stringify(t); })()`),
  );
}

/** Stand near the spot, freeze the loop, shoot it at `count` art frames `step` frames apart (synthetic time). */
async function sample(g, tag, id, step, count) {
  // Precondition: no spot hops during the sample (spots hop every 60-120 ticks = 3.6-7.2 s at 60 ms ticks, and a
  // hop's ripple/old art can land in the clips). Push every spot's move timer far ahead; fast ticks stay on.
  await g.update(`({ ...g, fishing: { ...g.fishing, spots: Object.fromEntries(Object.entries(g.fishing.spots).map(
    ([k, s]) => [k, { ...s, moveTimer: { respawnAt: g.tick + 1e9 } }])) } })`);
  const t = await spotTile(g, id);
  await g.teleportSettled(t.x + 5, t.y + 5);
  await g.settle();
  const c0 = await g.tileClient(t.x, t.y, 0);
  const cx = await g.tileClient(t.x + 1, t.y, 0);
  const cy = await g.tileClient(t.x, t.y + 1, 0);
  const tw = Math.abs(cx.x - cy.x); // tile diamond width in client px
  const covered = !(await g.page(`topIsCanvas(${c0.x}, ${c0.y})`));
  const clipOf = (p) => ({
    x: Math.max(0, p.x - tw * 0.42),
    y: Math.max(0, p.y - tw * 0.3),
    width: tw * 0.84,
    height: tw * 0.5,
  });
  const offsets = Array.from({ length: count }, (_, k) => k * step * (LOOP_MS / 24));
  const frames = await g.synth.frames(offsets, { name: `${tag}`, clip: clipOf(c0), keep: true });
  const shots = frames.map((f) => f.b64);
  // control clip of open water on the last stepped frame (loop still frozen)
  const ctl = (
    await g.cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { scale: 1, ...clipOf({ x: c0.x - tw * 1.6, y: c0.y - tw * 0.8 }) },
    })
  ).data;
  const after = await spotTile(g, id);
  await g.synth.thaw();
  expect(
    after.x === t.x && after.y === t.y,
    `spot hopped mid-sample ${JSON.stringify(t)} -> ${JSON.stringify(after)}`,
  );
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${tag}-control.png`, Buffer.from(ctl, 'base64'));
  const stats = await g
    .eval(`window.__fa(${JSON.stringify(shots)}).then(JSON.stringify)`)
    .then(JSON.parse);
  const ctlStat = JSON.parse(
    await g.eval(`window.__fa([${JSON.stringify(ctl)}]).then(JSON.stringify)`),
  )[0];
  const best = stats.reduce((b, s, i) => (s.white > stats[b].white ? i : b), 0);
  for (const [n, i] of [
    ['first', 0],
    ['peak', best],
  ])
    writeFileSync(`${SHOTS}/${tag}-${n}.png`, Buffer.from(shots[i], 'base64'));
  return { t, tw, covered, stats, ctlStat, n: shots.length };
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, rend) => {
  await g.eval(ANALYSE);
  const type = await g.eval('window.__idleRpg.scene().camera.scene.game.renderer.type');
  const tag = `${vp}-${rend}`;
  await check(`${tag}-r`, `${tag}: renderer is ${rend}`, async () => {
    expect(type === (rend === 'webgl' ? 2 : 1), `renderer.type ${type}`);
    return `renderer.type ${type}`;
  });
  await check(`${tag}-net`, `${tag}: net spot shows a school of dark fish that moves`, async () => {
    const net = await sample(g, `${tag}-net`, SPOTS.net, 3, 8);
    const dk = net.stats.map((s) => s.dark);
    expect(
      !net.covered,
      `spot ${JSON.stringify(net.t)} covered by HUD (top element is not the canvas)`,
    );
    expect(
      med(dk) >= 55 && med(dk) < 150,
      `median dark per-mille ${med(dk)} not in 55..150 (control ${net.ctlStat.dark})`,
    );
    expect(
      net.ctlStat.dark < 2,
      `open-water control already has ${net.ctlStat.dark} dark per-mille`,
    );
    const cxs = net.stats.filter((s) => s.dark).map((s) => s.cx);
    expect(range(cxs) > 0.02, `school centroid did not move (range ${range(cxs).toFixed(3)})`);
    return `${net.n} frames, dark permille med ${med(dk).toFixed(0)} min ${Math.min(...dk).toFixed(0)} max ${Math.max(...dk).toFixed(0)}, cx range ${range(cxs).toFixed(3)}, control ${net.ctlStat.dark}`;
  });
  await check(`${tag}-bait`, `${tag}: bait fish idles then jumps with a splash`, async () => {
    const bait = await sample(g, `${tag}-bait`, SPOTS.bait, 2, 12);
    const dk = bait.stats.map((s) => s.dark);
    const wh = bait.stats.map((s) => s.white);
    const tops = bait.stats.filter((s) => s.dark >= 5).map((s) => s.top);
    expect(!bait.covered, `spot ${JSON.stringify(bait.t)} covered by HUD`);
    expect(med(dk) >= 10, `median dark per-mille ${med(dk)} < 10 (control ${bait.ctlStat.dark})`);
    expect(bait.ctlStat.dark < 2, `control has ${bait.ctlStat.dark} dark per-mille`);
    expect(
      Math.max(...wh) >= med(wh) * 1.3,
      `no splash peak: white max ${Math.max(...wh)} med ${med(wh)}`,
    );
    expect(
      range(tops) > 0.12,
      `fish never rose out of the swirl (top range ${range(tops).toFixed(3)})`,
    );
    return `${bait.n} frames, dark med ${med(dk).toFixed(0)}, white med ${med(wh).toFixed(0)} max ${Math.max(...wh).toFixed(0)}, fish top range ${range(tops).toFixed(3)}`;
  });
  // console errors: lib's built-in 'console' check (same assertion as the old `-err` check)
});
