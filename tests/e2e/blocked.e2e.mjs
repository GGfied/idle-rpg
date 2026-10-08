// Blocked-action feedback e2e: no axe / level too low / inventory full -> chat line, no chop, short-lived effect.
// Run: node tests/e2e/blocked.e2e.mjs  (ports 9521..9522; E2E_PORT overrides). Exit 0 = all pass.
// Fast base (was a standalone vite+CDP script at 600 ms ticks, 2.5 s wall sampling per attempt): runParallel desktop +
// phone, withCombos, 60 ms ticks, budget 60 s. webgl only: effects are counted from the scene graph (live Text /
// Graphics children), renderer-independent. Each attempt arms an in-page per-frame recorder (effect count max, labels
// seen, session started) and waits on the chat line / effect instead of sampling 2.5 s; 'c2' (eventual full roll) runs
// 10x faster at 60 ms ticks. Effect lifetimes are frame-time based, so their appear/disappear checks are unchanged.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9521; // combos use 9521..9522
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const PAGE = `(() => {
  const scene = () => window.__idleRpg.scene();
  const world = () => scene().camera.scene;
  const live = (o) => o.visible && o.active && o.alpha > 0;
  window.__t = {
    // effect objects: live Text/Graphics in the world; also total child count (pool growth = leak)
    fx: () => world().children.list.filter((o) => (o.type === 'Text' || (o.type === 'Graphics' && o.depth > 0)) && live(o)).length,
    texts: () => world().children.list.filter((o) => o.type === 'Text' && live(o)).map((o) => o.text),
    total: () => world().children.list.length,
    trees: async () => { const { CONTENT } = await import('/src/app/registry.ts'); return [...CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, defId: t.defId })); },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
    lastChatId: () => { const c = window.__idleRpg.store.getState().game.chat; return c.length ? c[c.length - 1].id : -1; },
    chatSince: (id) => window.__idleRpg.store.getState().game.chat.filter((l) => l.id > id).map((l) => l.text),
    // per-frame recorder for one attempt: effect max over the baseline, every label seen, whether a session started
    recStart: () => { const R = (window.__br = { fx0: window.__t.fx(), fxMax: 0, texts: [], session: false, sessionAt: null, t0: performance.now(), on: true });
      const seen = () => { if (window.__idleRpg.store.getState().game.gathering.session && !R.session) { R.session = true; R.sessionAt = Math.round(performance.now() - R.t0); } };
      R.unsub = window.__idleRpg.store.subscribe(seen);
      const f = () => { if (!R.on) return; try { R.fxMax = Math.max(R.fxMax, window.__t.fx() - R.fx0); for (const t of window.__t.texts()) if (!R.texts.includes(t)) R.texts.push(t); seen(); } catch {} requestAnimationFrame(f); };
      f(); return R.fx0; },
    recStop: () => { const R = window.__br; R.on = false; R.unsub(); return { fx0: R.fx0, fxMax: R.fxMax, texts: R.texts, session: R.session, sessionAt: R.sessionAt }; },
    frames: (n) => new Promise((r) => { const f = () => (n-- <= 0 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); }),
  };
})();`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS, initScripts: [PAGE] }, COMBOS, async (g) => {
  const T = (e) => g.eval(`window.__t.${e}`);
  const setInv = (kind) => {
    const slot = {
      none: `(s) => (s && s.itemId.endsWith('_axe') ? null : s)`,
      axe: `(s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : null)`,
      full: `(s, i) => (i === 0 ? { itemId: 'bronze_axe', quantity: 1 } : { itemId: 'logs', quantity: 1 })`,
    }[kind];
    return g.update(
      `({ ...g, inventory: { ...g.inventory, slots: g.inventory.slots.map(${slot}) } })`,
    );
  };
  const setWc = (lvl) => g.setLevels({ woodcutting: lvl });
  const setEffects = async (text) => {
    const clientOf = () =>
      g.eval(
        `(() => { const g = [...document.querySelectorAll('.settings .steps')].find((x) => x.querySelector('.steps-label')?.textContent === 'Effects'); if (!g) return null; const b = [...g.querySelectorAll('button')].find((c) => c.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`,
      );
    if (!(await g.eval('!!document.querySelector(".settings")'))) {
      const b = await g.rect('button[aria-label="Settings"]');
      expect(b, 'no settings button');
      await g.tap(b.x, b.y);
      await g.waitFor(() => clientOf(), { label: 'settings Effects control' });
    }
    const r = await clientOf();
    expect(r, 'no Effects control ' + text);
    await g.tap(r.x, r.y);
    const c = await g.rect('button[aria-label="Close settings"]');
    expect(c, 'no close settings');
    await g.tap(c.x, c.y);
    await g.waitFor(() => g.eval('!document.querySelector(".settings")'), {
      label: 'settings closed',
    });
  };

  const trees = await T('trees()');
  const normal = trees.find((t) => t.defId === 'tree');
  const oak = trees.find((t) => t.defId === 'oak_tree');
  if (!normal || !oak) throw new Error('trees: ' + JSON.stringify(trees.slice(0, 5)));
  // stand on a tile adjacent to the tree (a neighbour with no path)
  const standBy = (t) => [t.x, t.y + 1];
  const treePoint = async (tree) => {
    let p = await g.tileClient(tree.x, tree.y, 0);
    if (!(await g.page(`topIsCanvas(${p.x}, ${p.y})`))) {
      await g.eval('window.__idleRpg.store.getState().recentreCamera()');
      await g.settle();
      p = await g.tileClient(tree.x, tree.y, 0);
    }
    return p;
  };

  /** One real tap on the tree; returns what the recorder saw until the feedback (chat line + effect) landed. */
  const attempt = async (tree, label) => {
    await g.teleportSettled(...standBy(tree));
    const p = await treePoint(tree);
    expect(
      await g.page(`topIsCanvas(${p.x}, ${p.y})`),
      `${label}: tree point ${JSON.stringify(p)} covered/off-screen`,
    );
    const id0 = await T('lastChatId()');
    const total0 = await T('total()');
    const pw = await T('playerWorld()');
    await T('recStart()');
    await g.tap(p.x, p.y);
    // was: sample 2.5 s. Now: wait for the chat line (or a session), then for the effect (1 s; none with Effects Off)
    await g
      .waitFor(
        async () => (await T(`chatSince(${id0})`)).length > 0 || (await g.eval('__br.session')),
        { timeoutMs: 2500, label: `${label} feedback` },
      )
      .catch(() => {});
    await g.waitFor(() => g.eval('__br.fxMax > 0'), { timeoutMs: 1000 }).catch(() => {});
    await T('frames(6)');
    const r = await T('recStop()');
    const chat = await T(`chatSince(${id0})`);
    const st = await g.state().then((s) => ({
      pos: s.movement.position,
      path: s.movement.path.length,
      pend: s.pendingInteraction,
      sess: s.gathering.session,
    }));
    return { chat, ...r, total0, pw, p, st };
  };
  const settled = async (fx0) => {
    await g.waitFor(async () => (await T('fx()')) <= fx0, {
      label: 'effects gone',
      timeoutMs: 4000,
    });
    return T('fx()');
  };

  await check('a', 'no axe: no chop, chat explains, effect appears then disappears', async () => {
    await setInv('none');
    await setWc(1);
    const r = await attempt(normal, 'a');
    if (r.chat.length === 0) {
      const r2 = await attempt(normal, 'a2');
      throw new Error(
        `first tap did nothing (chat [] state ${JSON.stringify(r.st)}); second attempt chat ${JSON.stringify(r2.chat)} fx ${r2.fxMax}`,
      );
    }
    expect(!r.session, 'a chop session started');
    expect(
      r.chat.some((l) => /axe/i.test(l)),
      'chat: ' +
        JSON.stringify(r.chat) +
        ' tap ' +
        JSON.stringify(r.p) +
        ' state ' +
        JSON.stringify(r.st),
    );
    expect(r.fxMax > 0, `no effect appeared (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    expect(
      r.texts.some((t) => /axe/i.test(t)),
      'no "axe" label: ' + JSON.stringify(r.texts),
    );
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check('b', 'level too low (oak): requirement in chat, effect shows then goes', async () => {
    await setInv('axe');
    await setWc(1);
    const r = await attempt(oak, 'b');
    expect(!r.session, 'b chop session started');
    expect(
      r.chat.some((l) => /15/.test(l)),
      'chat lacks requirement: ' + JSON.stringify(r.chat),
    );
    expect(r.fxMax > 0, `no effect (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    expect(
      r.texts.some((t) => /15/.test(t)),
      'label lacks level: ' + JSON.stringify(r.texts),
    );
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check('c', 'inventory full: no chop starts, chat line + effect right away', async () => {
    await setInv('full');
    await setWc(1);
    const r = await attempt(normal, 'c');
    const late = r.chat.length ? '' : ' (no chat line within 2.5 s)';
    expect(
      !r.session,
      `chop session started with a full inventory${late}; chat ${JSON.stringify(r.chat)}; state ${JSON.stringify(r.st)}`,
    );
    expect(
      r.chat.some((l) => /full/i.test(l)),
      'chat: ' + JSON.stringify(r.chat),
    );
    expect(r.fxMax > 0, `no effect (fxMax ${r.fxMax}); texts ${JSON.stringify(r.texts)}`);
    const fx = await settled(r.fx0);
    return `chat ${JSON.stringify(r.chat)}; effect +${r.fxMax} labels ${JSON.stringify(r.texts)}; gone fx ${r.fx0}->${fx}`;
  });

  await check(
    'c2',
    'inventory full (eventual): chat line + effect after the first failed roll, then session ends',
    async () => {
      await setInv('full');
      await setWc(1);
      await g
        .waitFor(async () => (await T('fx()')) === 0, {
          label: 'previous effects gone',
          timeoutMs: 5000,
        })
        .catch(() => {});
      await g.teleportSettled(...standBy(normal));
      const p = await treePoint(normal);
      const id0 = await T('lastChatId()');
      const fx0 = await T('recStart()');
      const t0 = Date.now();
      await g.tap(p.x, p.y);
      let msgAt = null;
      await g
        .waitFor(async () => (await T(`chatSince(${id0})`)).some((l) => /full/i.test(l)), {
          label: 'inventory-full line',
          timeoutMs: 40000,
        })
        .then(
          () => (msgAt = Date.now() - t0),
          () => {},
        );
      await T('frames(15)'); // was 15 x 40 ms of extra sampling after the line
      const r = await T('recStop()');
      expect(msgAt !== null, 'no inventory-full chat line within 40 s');
      await g.waitTicks(2); // was 300 ms at 600 ms ticks: the session must already be over
      expect(
        (await g.state('gathering.session')) === null,
        'session still running after the message',
      );
      expect(
        r.texts.includes('Inventory full'),
        `no Inventory full label (fx0 ${fx0}, max +${r.fxMax}); texts seen ${JSON.stringify(r.texts)}`,
      );
      return `session started at ${r.sessionAt}ms, chat line at ${msgAt}ms, effect +${r.fxMax} texts ${JSON.stringify(r.texts)}`;
    },
  );

  await check('d', 'repeat 10x: effect count and pool size return to baseline', async () => {
    await setInv('none');
    await setWc(1);
    // was sleep(2500): wait for the previous effects to end instead
    await g
      .waitFor(async () => (await T('fx()')) === 0, { label: 'effects gone', timeoutMs: 4000 })
      .catch(() => {});
    const fx0 = await T('fx()');
    const total0 = await T('total()');
    const totals = [];
    await g.teleportSettled(...standBy(normal));
    for (let i = 0; i < 10; i++) {
      await g.teleport(...standBy(normal), { settleMs: 0 });
      const p = await treePoint(normal);
      const id0 = await T('lastChatId()');
      await g.tap(p.x, p.y);
      await g
        .waitFor(async () => (await T(`chatSince(${id0})`)).length > 0, {
          label: `repeat ${i} line`,
          timeoutMs: 1500,
        })
        .catch(() => {});
      totals.push(await T('total()'));
    }
    const fx = await settled(fx0).catch(() => T('fx()'));
    await T('frames(10)');
    const total = await T('total()');
    expect(fx <= fx0, `live effects ${fx0} -> ${fx}`);
    expect(total - total0 <= 6, `pool grew ${total0} -> ${total} (series ${totals})`);
    return `live fx ${fx0}->${fx}; world children ${total0}->${total}; series ${totals}`;
  });

  await check('e', 'Effects Off: no effect, chat line still appears; restored after', async () => {
    await setEffects('Off');
    try {
      await setInv('none');
      await setWc(1);
      const r = await attempt(normal, 'e');
      expect(
        r.chat.some((l) => /axe/i.test(l)),
        'chat missing with effects off: ' + JSON.stringify(r.chat),
      );
      expect(
        r.fxMax === 0,
        `effect appeared with Effects Off (fxMax ${r.fxMax}) texts ${JSON.stringify(r.texts)}`,
      );
      expect(r.texts.length === 0, 'texts with effects off ' + JSON.stringify(r.texts));
      return `chat ${JSON.stringify(r.chat)}; fxMax ${r.fxMax}`;
    } finally {
      await setEffects('On');
    }
  });

  await check('f', 'effect returns after Effects On again', async () => {
    const r = await attempt(normal, 'f');
    expect(r.fxMax > 0, 'no effect after re-enable');
    return `fxMax ${r.fxMax}`;
  });
});
