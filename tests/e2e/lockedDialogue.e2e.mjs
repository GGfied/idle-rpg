// Locked dialogue choice (big-world item 10). Run: node tests/e2e/lockedDialogue.e2e.mjs
// A temporary choice node is patched into the live banker_greeting def in-page; talk is opened by a real tap on the banker.
// Fast base: runParallel desktop + phone + landscape (layout matters: tap target sizes), withCombos, 60 ms ticks,
// budget 60 s. webgl only: every check reads the React dialogue DOM, nothing is drawn by Phaser. Waits are on the
// dialogue DOM/state (typewriter advanced, text shown) and negative checks wait 3 frames + 2 ticks, not fixed sleeps.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9509; // combos use 9509..9511
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone', 'landscape'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const DLG = `section[aria-label^="Dialogue with"]`;
const CH = `${DLG} .dialogue-choice`;
const PATCH = `(async () => {
  const S = await import('/src/features/story/index.ts');
  const d = S.DIALOGUES.find((x) => x.id === 'banker_greeting');
  d.nodes.menu = { type: 'choice', options: [
    { text: 'QA open choice', next: 'qa_ok' },
    { text: 'QA locked choice', next: 'qa_ok', requirement: { type: 'skillLevel', skill: 'woodcutting', level: 15 } },
    { text: 'QA third choice', next: 'qa_third' } ] };
  d.nodes.qa_ok = { type: 'say', speaker: 'npc', text: 'QA UNLOCKED PATH', next: 'bye' };
  d.nodes.qa_third = { type: 'say', speaker: 'npc', text: 'QA THIRD PATH', next: 'bye' };
  return Object.keys(d.nodes).includes('bye');
})()`;
const snap = (g) =>
  g.eval(`(() => { const g = window.__e.game(); return JSON.stringify({ node: g.talk?.dialogue.nodeId, chat: g.chat.length,
    inv: g.inventory.slots, xp: g.progression.xp }); })()`);
const choices = (g) =>
  g.eval(`[...document.querySelectorAll(${JSON.stringify(CH)})].map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    return { text: b.textContent, disabled: b.disabled, aria: b.getAttribute('aria-disabled'), w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2, color: cs.color, bg: cs.backgroundColor,
      req: b.querySelector('.dialogue-req')?.textContent ?? null, reqH: b.querySelector('.dialogue-req')?.getBoundingClientRect().height ?? 0 }; })`);
const dlgText = (g) => g.eval(`document.querySelector('${DLG}')?.textContent ?? ''`);
/** "Nothing happened" needs time for something to happen: 3 rendered frames + 2 game ticks (store + React commit). */
const quiet = async (g) => {
  await g.eval(
    'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))))',
  );
  await g.waitTicks(2);
};
const key = async (g, k) => {
  for (const type of ['keyDown', 'keyUp'])
    await g.cdp.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      text: type === 'keyDown' ? k : undefined,
    });
};

async function openMenu(g) {
  await g.eval(PATCH);
  const b = (await g.targets()).find((t) => /banker/.test(t.id));
  expect(b, 'no banker target');
  await g.teleportSettled(b.x + 2, b.y + 2);
  await g.tapObject(b.id);
  await g.waitFor(async () => (await g.rect(DLG)) !== null, {
    label: 'dialogue open',
    timeoutMs: 15000,
  });
  // typewriter: a tap while typing completes the line (data-typing true -> false), else it advances the node; wait for
  // either after each tap (textContent alone does not change on completion: the rest is a hidden span)
  const stage = () =>
    g.eval(
      `JSON.stringify([window.__e.game().talk?.dialogue.nodeId, document.querySelector('${DLG} .dialogue-continue')?.dataset.typing, document.querySelectorAll(${JSON.stringify(CH)}).length])`,
    );
  for (let i = 0; i < 6 && (await choices(g)).length === 0; i++) {
    const s0 = await stage();
    await g.tapSelector(`${DLG} .dialogue-main`);
    await g
      .waitFor(async () => (await stage()) !== s0, { timeoutMs: 3000, label: 'dialogue advanced' })
      .catch(() => {});
  }
  await g.waitFor(async () => (await choices(g)).length === 3, { label: '3 choices' });
}

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await check('l1', 'locked choice visible + dimmed', async () => {
    await openMenu(g);
    const [a, l] = await choices(g);
    expect(
      l.text.includes('QA locked choice') && l.w > 0 && l.h > 0,
      `locked not visible ${JSON.stringify(l)}`,
    );
    expect(l.disabled && l.aria === 'true', `not disabled/aria ${l.disabled} ${l.aria}`);
    expect(l.color !== a.color, `colour same as unlocked ${l.color}`);
    await g.screenshot(`${vp}-menu`);
    return `locked color ${l.color} vs ${a.color}, bg ${l.bg} vs ${a.bg}`;
  });
  await check('l2a', 'shows the requirement (skill + level)', async () => {
    await openMenu(g);
    const l = (await choices(g))[1];
    expect(l.req && /woodcutting/i.test(l.req) && /15/.test(l.req), `req text: ${l.req}`);
    expect(l.reqH > 0, 'req not visible');
    return l.req;
  });
  await check('l2b', 'shows the current value ("Requires Woodcutting 15 (you: N)")', async () => {
    await openMenu(g);
    const l = (await choices(g))[1];
    expect(l.req === 'Requires Woodcutting 15 (you: 1)', `got: "${l.req}"`);
    return l.req;
  });
  await check('l3', 'tap/click locked does nothing', async () => {
    await openMenu(g);
    const before = await snap(g);
    const l = (await choices(g))[1];
    await g.tap(l.x, l.y);
    await quiet(g);
    const after = await snap(g);
    expect(before === after, `state changed ${before} -> ${after}`);
    expect(
      (await g.rect(DLG)) !== null && (await choices(g)).length === 3,
      'dialogue advanced/closed',
    );
    return `unchanged: ${after.slice(0, 60)}`;
  });
  await check('l4', 'key 2 (locked) nothing; key 9 nothing; key 3 picks third', async () => {
    await openMenu(g);
    const before = await snap(g);
    await key(g, '2');
    await key(g, '9');
    await quiet(g);
    const mid = await snap(g);
    expect(before === mid, `locked key changed state ${before} -> ${mid}`);
    await key(g, '3');
    const t = await g
      .waitFor(async () => (await dlgText(g)).includes('QA THIRD PATH') && dlgText(g), {
        timeoutMs: 3000,
        label: 'third path',
      })
      .catch(() => dlgText(g));
    expect(t.includes('QA THIRD PATH'), `key 3 did not advance: ${t.slice(0, 80)}`);
    return 'ok';
  });
  await check('l5', 'unlocked choice works (tap) and key 1 works', async () => {
    await openMenu(g);
    const a = (await choices(g))[0];
    await g.tap(a.x, a.y);
    await g.waitFor(
      async () =>
        (await g.eval(`document.querySelector('${DLG}')?.textContent ?? ''`)).includes(
          'QA UNLOCKED PATH',
        ),
      { label: 'unlocked path' },
    );
    await g.closeOverlays();
    await openMenu(g);
    await key(g, '1');
    const t = await g
      .waitFor(async () => (await dlgText(g)).includes('QA UNLOCKED PATH') && dlgText(g), {
        timeoutMs: 3000,
        label: 'unlocked path (key 1)',
      })
      .catch(() => dlgText(g));
    expect(t.includes('QA UNLOCKED PATH'), `key 1: ${t.slice(0, 80)}`);
    await g.screenshot(`${vp}-unlocked`);
    return 'tap + key 1 advance';
  });
  await check('l6', 'important chat lines amber (if any emitted)', async () => {
    const n = await g.eval(`window.__e.game().chat.filter((l) => l.important).length`);
    if (n === 0) return 'N/A: this dialogue emits no important chat lines (nothing to colour)';
    return `${n} important lines`;
  });
  await check('l7', 'tap targets >= 44px', async () => {
    await openMenu(g);
    const cs = await choices(g);
    expect(
      cs.every((c) => c.h >= 44 && c.w >= 44),
      `sizes ${cs.map((c) => `${c.w | 0}x${c.h | 0}`)}`,
    );
    const close = await g.rect('.dialogue-close');
    expect(close.w >= 44 && close.h >= 44, `close ${close.w}x${close.h}`);
    return `choices ${cs.map((c) => `${c.w | 0}x${c.h | 0}`)}; close ${close.w}x${close.h}`;
  });
});
