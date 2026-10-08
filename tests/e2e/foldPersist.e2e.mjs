// hud fold prefs (hud.sheetFold / hud.chatFold) survive a reload. Port 5268 (E2E_PORT overrides).
import { check, expect, withGame } from './lib.mjs';

const prefs = (g) =>
  g.eval(`(() => { const r = localStorage.getItem('idle-rpg:prefs'); if (!r) return null;
    const h = JSON.parse(r); const p = h.prefs ?? h; return { s: p.hud?.sheetFold, c: p.hud?.chatFold }; })()`);
const ui = (g) =>
  g.eval(
    `({ sheet: document.querySelector('.hud')?.dataset.folded, chat: document.querySelector('.chatbox')?.dataset.min })`,
  );
const box = (g, sel) =>
  g.eval(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height }; })()`,
  );
const reload = async (g) => {
  await g.cdp.send('Page.reload');
  await g.waitFor(() => g.page('ready()').catch(() => false), { timeoutMs: 25000, label: 'ready' });
  await g.sleep(900);
};
const tapSel = async (g, sel) => {
  const b = await box(g, sel);
  expect(b, `missing ${sel}`);
  await g.tap(b.x, b.y);
  await g.sleep(500);
};
const J = JSON.stringify;

await withGame({ port: 5268, viewport: 'phone' }, async (g) => {
  await check('f1', 'phone fresh: sheet + chat collapsed (auto)', async () => {
    const u = await ui(g);
    expect(u.sheet === 'true' && u.chat === 'true', J(u));
    return J({ ui: u, prefs: await prefs(g) });
  });
  await check('f2', 'expand both, reload: still expanded, stored expanded', async () => {
    await tapSel(g, '.tabs [role=tab]');
    await tapSel(g, '.chat-toggle');
    const u0 = await ui(g);
    expect(u0.sheet === 'false' && u0.chat === 'false', 'did not expand ' + J(u0));
    await g.sleep(600);
    await reload(g);
    const u = await ui(g);
    const p = await prefs(g);
    expect(
      u.sheet === 'false' && u.chat === 'false' && p?.s === 'expanded' && p?.c === 'expanded',
      J({ u, p }),
    );
    return J({ u, p });
  });
  await check('f3', 'collapse both, reload: still collapsed, stored collapsed', async () => {
    await tapSel(g, '.sheet-fold');
    await tapSel(g, '.chat-toggle');
    const u0 = await ui(g);
    expect(u0.sheet === 'true' && u0.chat === 'true', 'did not collapse ' + J(u0));
    await g.sleep(600);
    await reload(g);
    const u = await ui(g);
    const p = await prefs(g);
    expect(
      u.sheet === 'true' && u.chat === 'true' && p?.s === 'collapsed' && p?.c === 'collapsed',
      J({ u, p }),
    );
    return J({ u, p });
  });
  await check('f4', 'desktop with stored collapsed: HUD still normal', async () => {
    await g.setViewport('desktop');
    await reload(g);
    const r =
      await g.eval(`(() => { const h = document.querySelector('.hud'); const cs = getComputedStyle(h); const hr = h.getBoundingClientRect();
      const cb = document.querySelector('.chatbox')?.getBoundingClientRect();
      return { folded: h.dataset.folded, chatMin: document.querySelector('.chatbox')?.dataset.min, hudDisplay: cs.display, hud: [hr.width, hr.height],
        chat: cb && [cb.width, cb.height], slots: document.querySelectorAll('.hud .slot').length,
        sheetFold: getComputedStyle(document.querySelector('.sheet-fold')).display, chatToggle: getComputedStyle(document.querySelector('.chat-toggle')).display }; })()`);
    await g.screenshot('foldpersist-desktop');
    expect(
      r.hudDisplay !== 'none' && r.hud[1] > 100 && r.slots > 0 && r.chat && r.chat[1] > 30,
      J(r),
    );
    return J(r);
  });
});
