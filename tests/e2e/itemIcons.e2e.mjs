// QA slice MF5b-icons: one item image everywhere (inventory === bank === deposit-only === ground). E2E_PORT, SHOTS_DIR optional.
// Run: node tests/e2e/itemIcons.e2e.mjs (ports 9410-9411; fast base: parallel desktop + phone children, ?tickMs=60,
// wait-on-state instead of sleeps, budget 60 s). Icons are DOM <img> + Phaser texture keys: renderer-independent.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9410;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const ITEMS = ['logs', 'bronze_axe', 'copper_ore', 'raw_shrimp'];
const VIEWS = `(() => { const sc = window.__idleRpg.scene().camera.scene;
  return sc.children.list.filter((c) => c.type === 'Container' && c.list?.[0]?.texture?.key === 'ground_shadow' && c.visible && c.active)
    .map((c) => ({ x: c.x, y: c.y, key: c.list[1].texture.key })); })()`;
const SRCS = (sel) =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width), alt: i.closest('.slot')?.getAttribute('aria-label') }))`;

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  process.env.SHOTS_DIR ||= 'tests/e2e/.shots-icons';
  const expectedSrc = (id) =>
    g.eval(
      `(async () => (await import('/src/render/itemIcons.ts')).itemIconUrl(${JSON.stringify(id)}))()`,
    );
  const srcMap = async () =>
    Object.fromEntries(await Promise.all(ITEMS.map(async (i) => [i, await expectedSrc(i)])));
  const openBank = (mode) =>
    g.update(`({ ...g, bankOpen: true, bankMode: ${JSON.stringify(mode)} })`);
  const stacks = ITEMS.map((itemId) => ({ itemId, quantity: 1 }));
  let want;
  // Phone: the HUD sheet boots folded (slots 0x0); unfold it with a real tap on the chevron.
  const unfold = async () => {
    if (g.touch && (await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`))) {
      await g.tapSelector('.sheet-fold');
      await g.waitFor(() => g.eval(`document.querySelector('.hud').dataset.folded === 'false'`), {
        label: 'sheet unfolded',
        timeoutMs: 4000,
      });
      await g.settleRect('[data-slot-index="0"]'); // unfold animation finished
    }
  };
  /** Wait until `n` icons match css and every one has loaded (replaces fixed 200-300 ms sleeps). */
  const iconsReady = (css, n) =>
    g
      .waitFor(
        async () => {
          const s = await g.eval(SRCS(css));
          return s.length === n && s.every((x) => x.ok);
        },
        { label: `${n} loaded icons in ${css}`, timeoutMs: 5000 },
      )
      .catch(() => {}); // the check's own expects report the numbers

  await check('i1', 'inventory slots show the shared icon url (loaded, >0 px)', async () => {
    want = await srcMap();
    await unfold();
    await g.setInventory(ITEMS);
    await iconsReady('.slot-grid .slot-icon', 4);
    const s = await g.eval(SRCS('.slot-grid .slot-icon'));
    expect(s.length === 4, `icons ${s.length}`);
    s.forEach((x, i) =>
      expect(
        x.src === want[ITEMS[i]] && x.ok && x.w > 0,
        `${i} ${JSON.stringify(x)} want ${want[ITEMS[i]]}`,
      ),
    );
    await g.screenshot(`inv-${vp}`);
    return `${vp}: ${s.map((x) => x.w).join(',')} px, urls match ${ITEMS.length}/${ITEMS.length}`;
  });

  await check(
    'i2',
    'full bank: bank grid and inventory grid slots identical to inventory',
    async () => {
      await g.update(`({ ...g, bank: { ...g.bank, items: ${JSON.stringify(stacks)} } })`);
      await openBank('full');
      await iconsReady('[role=dialog] .slot-icon', 8);
      const s = await g.eval(SRCS('[role=dialog] .slot-icon'));
      expect(s.length === 8, `icons ${s.length}`);
      s.forEach((x, i) =>
        expect(x.src === want[ITEMS[i % 4]] && x.ok, `${i} ${JSON.stringify(x)}`),
      );
      await g.screenshot(`bank-${vp}`);
      return `${vp}: 8 bank+inv icons match, all loaded`;
    },
  );

  await check('i3', 'deposit-only chest slots identical', async () => {
    await g.closeOverlays();
    await openBank('depositOnly');
    await iconsReady('[role=dialog] .slot-icon', 4);
    const s = await g.eval(SRCS('[role=dialog] .slot-icon'));
    expect(s.length === 4, `icons ${s.length}`);
    s.forEach((x, i) => expect(x.src === want[ITEMS[i]] && x.ok, `${i} ${JSON.stringify(x)}`));
    await g.screenshot(`deposit-${vp}`);
    return `${vp}: 4 deposit icons match`;
  });

  const lane =
    await g.eval(`(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const gr = CONTENT.grid; const s = window.__e.game().movement.position;
      for (let r = 0; r < 12; r++) for (let x = s.x - r; x <= s.x + r; x++) for (let y = s.y - r; y <= s.y + r; y++) if (gr.isWalkable(x, y) && gr.isWalkable(x + 1, y) && gr.isWalkable(x - 1, y)) return { x, y }; })()`);
  const dropSlot = async (idx) => {
    await unfold();
    await g.tapSelector(`[data-slot-index="${idx}"]`);
    const r = await g.eval(
      `(() => { const b = [...document.querySelectorAll('.menu-item')].find((e) => e.textContent.trim() === 'Drop'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    expect(r, `no Drop item for slot ${idx}`);
    await g.tap(r.x, r.y);
  };
  const keyOf = (id) =>
    g.eval(
      `(async () => (await import('/src/render/itemIcons.ts')).itemIconSource(${JSON.stringify(id)}).key)()`,
    );

  for (const [cid, id, idx] of [
    ['d1', 'logs', 0],
    ['d2', 'bronze_axe', 1],
    ['d3', 'copper_ore', 2],
    ['d4', 'raw_shrimp', 3],
  ]) {
    await check(
      cid,
      `drop ${id}: ground item exists and sprite texture key == itemIconSource key`,
      async () => {
        await g.closeOverlays();
        if (cid === 'd1') {
          await g.update(`({ ...g, bankOpen: false })`);
          await g.setInventory(ITEMS);
          await g.teleportSettled(lane.x, lane.y);
        }
        // MAX_PILE = 3 drawn items per tile (by design): the 4th drop goes on the next tile.
        if (cid === 'd4') await g.teleportSettled(lane.x + 1, lane.y);
        const before = await g.state('ground.items');
        await dropSlot(idx);
        await g
          .waitState('ground.items', `gi => gi.length > ${before.length}`, {
            label: `${id} dropped`,
            timeoutMs: 4000,
          })
          .catch(() => {}); // the expect below reports ground + chat
        const gi = await g.state('ground.items');
        expect(
          gi.length === before.length + 1 && gi.some((x) => x.itemId === id),
          `ground ${JSON.stringify(gi)} chat ${(await g.chatLines()).slice(-2)}`,
        );
        const key = await keyOf(id);
        let v = [];
        await g
          .waitFor(async () => (v = await g.eval(VIEWS)).some((x) => x.key === key), {
            label: `ground view ${key}`,
            timeoutMs: 4000,
          })
          .catch(() => {}); // the expect below reports the views
        expect(
          v.some((x) => x.key === key),
          `want ${key} got ${JSON.stringify(v)}`,
        );
        if (cid === 'd2') {
          const c = await g.eval(
            `(() => { const sc = window.__idleRpg.scene().camera.scene; const t = sc.textures.get(${JSON.stringify(key)}); const im = t.getSourceImage(); return { w: im.width, h: im.height }; })()`,
          );
          expect(c.w > 0, `tex ${JSON.stringify(c)}`);
          await g.screenshot(`ground-${vp}`);
        }
        return `${vp}: ${id} ground ${gi.length}, views ${v.map((x) => x.key).join(',')}`;
      },
    );
  }
});
