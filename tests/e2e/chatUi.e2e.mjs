// chatUi: restyled chatbox + dialogue panel. Run: node tests/e2e/chatUi.e2e.mjs
// Fast base: runParallel desktop + phone (HUD DOM boxes only: renderer does not matter, webgl), fast ticks,
// teleportSettled + "dialogue advanced" waits instead of fixed 700/500 ms sleeps, budget 60 s.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9455; // combos use 9455..9456
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const box = (g, css) =>
  g.eval(
    `(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`,
  );
const overlap = (a, b) =>
  a && b && a.w > 0 && b.w > 0 && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const setAnim = (g, m) =>
  g.eval(
    `window.__idleRpg.store.getState().setPref({ visuals: { animations: ${JSON.stringify(m)} } })`,
  );
const typedLen = (g) =>
  g.eval(
    `(() => { const t = document.querySelector('.dialogue-text'); return t ? t.textContent.length - (t.querySelector('.dialogue-rest')?.textContent.length ?? 0) : -1; })()`,
  );
const fullLen = (g) =>
  g.eval(`document.querySelector('.dialogue-text')?.textContent?.length ?? -1`);

async function talk(g) {
  const banker =
    (await g.targets()).find((t) => t.id.includes('banker') && t.kind === 'npc') ??
    (await g.targetOfKind('npc'));
  await g.teleportSettled(banker.x + 2, banker.y + 2);
  await g.tapObject(banker.id);
  await g.waitFor(() => g.eval(`!!document.querySelector('.dialogue-text, .dialogue-choice')`), {
    label: 'dialogue open',
  });
  return banker;
}
const toChoices = async (g) => {
  for (let i = 0; i < 5; i++) {
    if (await g.eval(`!!document.querySelector('.dialogue-choice')`)) return;
    const before = await g.eval(`document.querySelector('.dialogue-text')?.textContent ?? ''`);
    await g.tapSelector('.dialogue-main');
    // the tap either finishes the typewriter / turns the page (text changes) or reveals the choices
    await g
      .waitFor(
        () =>
          g.eval(
            `!!document.querySelector('.dialogue-choice') || (document.querySelector('.dialogue-text')?.textContent ?? '') !== ${JSON.stringify(before)}`,
          ),
        { label: 'dialogue advanced', timeoutMs: 3000 },
      )
      .catch(() => {});
  }
};

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  await check('t2', 'banker choices >=44px, close >=44px, choosing by tap works', async () => {
    await setAnim(g, 'off');
    await talk(g);
    await toChoices(g);
    const hs = await g.eval(
      `[...document.querySelectorAll('.dialogue-choice')].map((e) => e.getBoundingClientRect().height)`,
    );
    const close = await box(g, '.dialogue-close');
    await g.screenshot(`chatUi-${vp}-choices`);
    expect(hs.length === 3, `choices ${hs.length}`);
    expect(
      hs.every((h) => h >= 44) && close.h >= 44 && close.w >= 44,
      () => `heights ${hs} close ${close.w}x${close.h}`,
    );
    // choice 2 'What is this place?' -> say node with the about text
    await g.tapSelector('.dialogue-choice:nth-of-type(1)'.replace(':nth-of-type(1)', ''));
    return `${vp}: heights ${hs.map((h) => Math.round(h))} close ${close.w}x${close.h}`;
  });
  await check('t2b', 'tapping choice 2 shows the about text; choice 3 closes', async () => {
    await setAnim(g, 'off');
    await g.closeOverlays();
    await talk(g);
    await toChoices(g);
    const r2 = await g.eval(
      `(() => { const r = document.querySelectorAll('.dialogue-choice')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await g.tap(r2.x, r2.y);
    await g.waitFor(
      () =>
        g.eval(
          `/keep your things/.test(document.querySelector('.dialogue-text')?.textContent ?? '')`,
        ),
      { label: 'about text' },
    );
    await toChoices(g);
    const r3 = await g.eval(
      `(() => { const r = document.querySelectorAll('.dialogue-choice')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await g.tap(r3.x, r3.y);
    await g.waitFor(() => g.eval(`!document.querySelector('.dialogue')`), {
      label: 'dialogue closed',
    });
    return 'choice 2 -> about text, choice 3 -> closed';
  });
  await check('t3', 'typewriter: On types and tap completes; Off shows full at once', async () => {
    await setAnim(g, 'on');
    await g.closeOverlays();
    await talk(g);
    const full = await fullLen(g);
    const early = await typedLen(g);
    expect(early < full, `On: typed ${early} of ${full} right after open`);
    await g.tapSelector('.dialogue-main');
    const afterTap = await typedLen(g);
    expect(afterTap === full, `tap did not finish typing: ${afterTap}/${full}`);
    await g.closeOverlays();
    await setAnim(g, 'off');
    await talk(g);
    const f2 = await fullLen(g),
      t2 = await typedLen(g);
    expect(t2 === f2 && f2 > 0, `Off: ${t2}/${f2}`);
    return `${vp}: On early ${early}/${full}, after tap ${afterTap}; Off ${t2}/${f2}`;
  });
  await check('t4', 'chat strip / dialogue sheet vs inventory, orbs, minimap boxes', async () => {
    await setAnim(g, 'off');
    await g.closeOverlays();
    await g.eval(`window.__idleRpg.store.getState().say?.('test line')`);
    const sel = ['.orbs', '.minimap-wrap', '.hud-body', '.inventory-grid, .inventory'];
    const chat = await box(g, '.chatbox');
    const bad = [];
    const info = [
      `chat ${Math.round(chat.l)},${Math.round(chat.t)} ${Math.round(chat.w)}x${Math.round(chat.h)}`,
    ];
    for (const s of sel) {
      const b = await box(g, s);
      if (b && overlap(chat, b)) bad.push(`chat~${s}`);
    }
    await talk(g);
    await g.screenshot(`chatUi-${vp}-dialogue`);
    const d = await box(g, '.dialogue');
    info.push(
      `dialogue ${Math.round(d.l)},${Math.round(d.t)} ${Math.round(d.w)}x${Math.round(d.h)} (innerH ${await g.eval('innerHeight')})`,
    );
    for (const s of ['.orbs', '.inventory-grid, .inventory', '.minimap-wrap']) {
      const b = await box(g, s);
      if (b && b.w > 0 && overlap(d, b)) bad.push(`dialogue~${s}`);
    }
    expect(bad.length === 0, () => `overlaps: ${bad} | ${info}`);
    return `${vp}: ${info.join(' | ')}`;
  });
});
