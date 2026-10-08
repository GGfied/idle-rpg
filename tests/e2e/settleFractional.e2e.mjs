// g.settle() waits on the FRACTIONAL camera scroll. Discriminating case: after a follow-camera glide, the OLD helper (integer
// worldView, eps 0.5, stable 2 x 100 ms) returns while the camera still has scroll left to travel; g.settle() does not.
import { check, expect, runParallel, waitStill, withCombos } from './lib.mjs';
import { sleep } from './cdp.mjs';

const PORT = 6605;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const SCROLL = `(() => { const c = window.__idleRpg.scene().camera; return { x: c.scrollX, y: c.scrollY }; })()`;
const VIEW = `(() => { const v = window.__idleRpg.scene().camera.worldView; return { x: v.x, y: v.y }; })()`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  // tail after a settle returned: max scroll travel + whether the integer worldView still moved, over the next 2 s
  const tail = async () => {
    const s0 = await g.eval(SCROLL);
    const v0 = await g.eval(VIEW);
    let maxD = 0;
    let viewMoved = 0;
    for (let i = 0; i < 50; i++) {
      await sleep(40);
      const s = await g.eval(SCROLL);
      const v = await g.eval(VIEW);
      maxD = Math.max(maxD, Math.hypot(s.x - s0.x, s.y - s0.y));
      viewMoved = Math.max(viewMoved, Math.hypot(v.x - v0.x, v.y - v0.y));
    }
    return { maxD, viewMoved };
  };
  // slow the follow glide (lerp 0.02/frame) so its tail is a long run of sub-pixel steps, like the phone chat-strip glide
  const lerp = await g.eval(
    `(() => { const c = window.__idleRpg.scene().camera; const o = c.lerp.x; c.lerp.set(0.02, 0.02); return o; })()`,
  );
  const legs = [
    [40, 40],
    [70, 60],
    [100, 30],
  ];
  const old = [];
  const fine = [];
  for (const [x, y] of legs) {
    await g.teleport(x, y, { settleMs: 0 });
    await waitStill(() => g.eval(VIEW), { intervalMs: 100, stable: 2 }); // the OLD g.settle
    old.push(await tail());
    await g.teleport(x - 25, y + 5, { settleMs: 0 });
    await g.settle(); // the NEW one
    fine.push(await tail());
  }
  await g.eval(`window.__idleRpg.scene().camera.lerp.set(${lerp}, ${lerp})`);
  const f = (a) => a.map((t) => `${t.maxD.toFixed(2)}px/view${t.viewMoved}`).join(', ');
  await check(
    'old',
    'old integer-worldView settle returns before the glide ends (scroll still moves > 0.5 px)',
    () => {
      expect(Math.max(...old.map((t) => t.maxD)) > 0.5, `old tails: ${f(old)}`);
      return `${vp}: old tails ${f(old)}`;
    },
  );
  await check(
    'new',
    'g.settle() returns only once the scroll is done (<= 0.25 px left, worldView still)',
    () => {
      expect(Math.max(...fine.map((t) => t.maxD)) <= 0.25, `new tails: ${f(fine)}`);
      expect(
        Math.max(...fine.map((t) => t.viewMoved)) === 0,
        `worldView moved after settle: ${f(fine)}`,
      );
      return `${vp}: new tails ${f(fine)}`;
    },
  );
});
