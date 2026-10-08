// QA slice "fire + cooking visuals": kneel, real fire view, flicker, spark/smoke/steam VFX, cook pose + facing,
// dying look, ashes, food icons, Light menu. Run: node tests/e2e/fireVisuals.e2e.mjs
// Shots: tests/e2e/.shots-visuals/. Known (not asserted): back upper arm "wing" while lighting, no log pile while lighting.
// Fast base: desktop/phone x webgl/canvas as parallel children (fire + VFX art is the subject), ?tickMs=60 except the
// two phases noted at their check (lighting, dying), wait-on-state instead of sleeps, flicker sampled on synthetic
// frames (g.synth) instead of 12 wall-clock samples, budget 60 s.
import { check, runParallel, withCombos } from './lib.mjs';

const PORT = 9306; // C7 port block 9301-9350; 4 combos use 9306-9309
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl', 'canvas'],
  budgetMs: BUDGET_MS,
});

process.env.SHOTS_DIR ??= new URL('./.shots-visuals/', import.meta.url).pathname;
const START = { x: 18, y: 15 };
const fires = (g) => g.state('firemaking.fires');
const SCENE = `window.__idleRpg.scene().camera.scene`;
const FLAT = `const flat = (l) => l.flatMap((c) => c.list ? [c, ...flat(c.list)] : [c]); const all = flat(${SCENE}.children.list);`;
// flame layers: [key, scaleX, scaleY, alpha, rootScale]
const FLAMES = `(() => { ${FLAT} return all.filter((o) => o.texture && /^fire_flame/.test(o.texture.key)).map((o) => [o.texture.key, +o.scaleX.toFixed(4), +o.scaleY.toFixed(4), +o.alpha.toFixed(3), o.parentContainer ? +o.parentContainer.scaleX.toFixed(3) : -1]); })()`;
const TEX = (re) =>
  `(() => { ${FLAT} return all.filter((o) => o.texture && ${re}.test(o.texture.key) && o.visible).length; })()`;
// In-page particle sampler: counts visible Arcs by fill colour palette (fillColor values from render/vfx/data.ts).
const SAMPLER = `(() => { const P = { spark: [0xfff4b0, 0xffe27a], smoke: [0x8e8e8e, 0xa6a6a6, 0x7a7a7a], steam: [0xf0f0f0, 0xe2e2e2], burnt: [0x2e2e2e, 0x3d3d3d, 0x4a4a4a] };
  window.__vs = { max: { spark: 0, smoke: 0, steam: 0, burnt: 0 } };
  clearInterval(window.__vsT);
  window.__vsT = setInterval(() => { try { const c = { spark: 0, smoke: 0, steam: 0, burnt: 0 };
    for (const o of ${SCENE}.children.list) { if (o.type !== 'Arc' || !o.visible || !(o.alpha > 0)) continue;
      for (const k in P) if (P[k].includes(o.fillColor)) c[k]++; }
    for (const k in c) window.__vs.max[k] = Math.max(window.__vs.max[k], c[k]); } catch (e) { window.__vs.err = String(e); } }, 25); })()`;
const resetMax = (g) => g.eval(`(window.__vs.max = { spark: 0, smoke: 0, steam: 0, burnt: 0 }, 0)`);
const animState = (g) => g.eval(`${SCENE}.animState`);
const vsMax = (g) => g.eval(`window.__vs.max`);
/** Wait for a condition but never throw: the check's own expect() reports the failure with numbers. */
const soft = (g, f, label, timeoutMs = 6000) => g.waitFor(f, { label, timeoutMs }).catch(() => {});
const menuLabels = (g) =>
  g.eval(
    `[...document.querySelectorAll('[role=menu] .menu-item')].map((x) => x.textContent.trim())`,
  );

async function sheet(g, open) {
  if (!g.touch) return;
  const folded = await g.eval(`document.querySelector('.hud').dataset.folded === 'true'`);
  if (folded === open) {
    await g.tapSelector('.sheet-fold');
    await g.waitFor(
      () => g.eval(`document.querySelector('.hud').dataset.folded === '${String(!open)}'`),
      { label: `sheet ${open ? 'open' : 'folded'}`, timeoutMs: 4000 },
    );
    if (open) await g.settleRect('.slot-grid'); // sheet slide finished before slot rects are read
  }
}
/** Open an inventory slot's menu with real input (long-press on phone, falls back to a contextmenu event); returns {labels, synthetic}. */
async function openMenu(g, slot) {
  await sheet(g, true);
  const r = await g.rect(`[data-slot-index="${slot}"]`);
  const labels = () => menuLabels(g);
  const opened = (ms = 1500) => soft(g, async () => (await labels()).length > 0, 'menu open', ms);
  await g.longPress(r.x, r.y);
  // CDP touch long-press usually fires no native contextmenu (qa memory): short wait on phone, then the fallback.
  await opened(g.touch ? 300 : 1500);
  let l = await labels();
  let synthetic = false;
  if (!l.length && g.touch) {
    synthetic = true;
    await g.eval(
      `document.querySelector('[data-slot-index="${slot}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${r.x}, clientY: ${r.y}, button: 2 }))`,
    );
    await opened();
    l = await labels();
  }
  return { labels: l, synthetic };
}
const pick = async (g, label) => {
  const m = await g.eval(
    `(() => { const e = [...document.querySelectorAll('[role=menu] .menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`,
  );
  await g.tap(m.x, m.y);
};

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp, renderer) => {
  const shot = (name) => g.screenshot(`${name}-${vp}-${renderer}`);
  await g.update(
    `({ ...g, firemaking: { ...g.firemaking, fires: [], lighting: null }, chat: [] })`,
  );
  await g.setInventory([
    'tinderbox',
    { itemId: 'logs', quantity: 3 },
    { itemId: 'raw_shrimp', quantity: 28 },
  ]);
  await g.teleportSettled(START.x, START.y);
  await g.eval(`${SCENE}.cameras.main.setZoom(${vp === 'phone' ? 2.4 : 2.2}), 0`);
  await g.settle();
  await g.eval(SAMPLER);
  let root1 = 1;

  await check(
    'v6',
    'Light menu: logs = Light/Use/Drop/Examine/Cancel; shrimp has no Light',
    async () => {
      const a = await openMenu(g, 2); // raw_shrimp
      g.expect(!a.labels.includes('Light') && a.labels.length > 0, 'shrimp menu ' + a.labels);
      await g.closeOverlays();
      const b = await openMenu(g, 1);
      g.expect(
        JSON.stringify(b.labels) === JSON.stringify(['Light', 'Use', 'Drop', 'Examine', 'Cancel']),
        'logs menu ' + b.labels,
      );
      await shot('light-menu');
      // realTime for the LIGHTING phase only: at 60 ms ticks the kneel lasts a few hundred ms, too short to observe
      // the lighting anim + its strike sparks reliably. Back to fast ticks the moment the fire is lit (v1b).
      await g.setTickMs(600);
      // Per-frame recorder of the kneel (animState + fireAction read in the SAME frame): a lucky first-strike light
      // can end the kneel before a CDP round trip reads it under load (seen once: waitFor saw 'lighting', the next
      // read saw idle). The recorder keeps the first frame where the player was kneeling.
      await g.eval(
        `(() => { window.__kneel = null; const f = () => { try { const sc = ${SCENE}; if (!window.__kneel && sc.animState === 'lighting') window.__kneel = { st: sc.animState, act: sc.fireAction }; } catch {} if (!window.__kneel) requestAnimationFrame(f); }; f(); })()`,
      );
      await pick(g, 'Light'); // real tap on the Light item
      return `${vp}/${renderer}: shrimp [${a.labels}] logs [${b.labels}]${b.synthetic ? ' (contextmenu synthetic: CDP long-press has no native contextmenu)' : ' (real long-press/right-click)'}`;
    },
  );
  await sheet(g, false);

  await check(
    'v1a',
    'lighting: player kneels (animState lighting), strike sparks fire',
    async () => {
      await g.waitFor(() => g.eval('window.__kneel'), { label: 'lighting anim', timeoutMs: 6000 });
      const { st, act } = await g.eval('window.__kneel');
      await shot('kneel');
      await soft(g, async () => (await vsMax(g)).spark > 0, 'strike sparks');
      const m = await vsMax(g);
      g.expect(st === 'lighting' && act === 'lighting', `anim ${st} action ${act}`);
      g.expect(m.spark > 0, 'no strike sparks seen ' + JSON.stringify(m));
      return `${vp}/${renderer}: anim ${st}, action ${act}, spark particles max ${m.spark}`;
    },
  );

  await check('v1b', 'lit: real fire view (logs + 3 flame layers + glow), screenshot', async () => {
    await g.waitFor(async () => (await fires(g)).length > 0, { label: 'lit', timeoutMs: 20000 });
    await g.setTickMs(60); // lighting phase over: fast ticks again
    // Precondition: keep the fire burning through v1c-v2b. At 60 ms ticks its natural burn time passes 10x faster
    // than in the old 600 ms run, so it could go out mid-cooking (seen: no steam, no fire for v4a). v4a forces dying.
    await g.update(
      `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 1e6 })) } })`,
    );
    await soft(g, async () => (await g.eval(FLAMES)).length === 3, 'fire view built', 4000);
    const f = await g.eval(FLAMES);
    const glow = await g.eval(TEX('/^fire_glow/'));
    const base = await g.eval(TEX('/^fire_base$/'));
    g.expect(
      f.length === 3 && glow === 1 && base === 1,
      `flames ${f.length} glow ${glow} base ${base}`,
    );
    root1 = f[0][4];
    await shot('lit');
    return `${vp}/${renderer}: flame layers ${f.map((x) => x[0]).join(',')}, glow ${glow}, base ${base}, root scale ${root1}`;
  });

  await check('v1c', 'flicker: flame layer scale varies across 12 samples', async () => {
    // 12 synthetic frames 90 ms apart (same spacing as the old wall-clock samples), all in ONE page eval.
    let rows;
    await g.synth.freeze();
    try {
      rows = await g.eval(
        `(() => { const r = []; for (let i = 1; i <= 12; i++) { window.__e.synth.stepTo(i * 90); r.push(${FLAMES}); } return r; })()`,
      );
    } finally {
      await g.synth.thaw();
    }
    const per = [0, 1, 2].map((l) => new Set(rows.map((r) => r[l][1] + '/' + r[l][2])).size);
    g.expect(
      per.every((n) => n >= 3),
      'distinct scales per layer ' + per,
    );
    const xs = rows.map((r) => r[2][1]);
    return `${vp}/${renderer}: distinct scales per layer ${per}; core scaleX ${Math.min(...xs)}..${Math.max(...xs)}`;
  });

  await check('v2a', 'VFX: smoke column active while the fire burns', async () => {
    await resetMax(g);
    await soft(g, async () => (await vsMax(g)).smoke > 0, 'smoke', 5000);
    const m = await vsMax(g);
    g.expect(m.smoke > 0, 'no smoke ' + JSON.stringify(m));
    return `${vp}/${renderer}: smoke particles max ${m.smoke}`;
  });

  // Fire rect is 48 wide, tree rect 39 wide (render/views.ts VIEW_HIT_BOUNDS): |dx| in (19.5, 24) is fire-only.
  const tapOff = async (f, dx, dy) => {
    const p = await g.eval(
      `(async () => { const { isoProjection } = await import('/src/render/projection.ts'); const w = isoProjection.tileToWorld(${f.tile.x}, ${f.tile.y}); return window.__e.toClient(w.x + ${dx}, w.y + ${dy}); })()`,
    );
    await g.tap(p.x, p.y);
  };
  await check(
    'v3a',
    'cooking: tap outside the fire rect (dx +32) does not start cooking',
    async () => {
      const f = (await fires(g))[0];
      await tapOff(f, 32, -14);
      // negative: the tap walks the player; wait for the walk to end, then a few more ticks for any interaction
      await g.waitIdle();
      await g.waitTicks(5);
      const s = await g.state('cooking.session');
      g.expect(!s, 'cooking started outside fire rect ' + JSON.stringify(s));
      return `${vp}/${renderer}: dx +32 -> no cooking session`;
    },
  );

  await check(
    'v3',
    'cooking: tap flames (hit kind fire) -> cook pose, facing the fire',
    async () => {
      const f = (await fires(g))[0];
      await tapOff(f, 22, -14); // inside fire rect only (tree bounds end at 19.5)
      await g.waitFor(async () => !!(await g.state('cooking.session')), {
        label: 'cooking session',
        timeoutMs: 8000,
      });
      await g.waitFor(async () => (await animState(g)) === 'cooking', {
        label: 'cooking anim',
        timeoutMs: 6000,
      });
      const pos = await g.state('movement.position');
      const want = await g.eval(
        `(async () => (await import('/src/render/animation/logic.ts')).facingFromStep(${f.tile.x - pos.x}, ${f.tile.y - pos.y}))()`,
      );
      // the old 900 ms sleep let the turn finish: wait for the facing instead (fails below with numbers)
      await soft(g, async () => (await g.eval(`${SCENE}.facing`)) === want, 'facing fire', 3000);
      const st = await animState(g);
      const face = await g.eval(`${SCENE}.facing`);
      await shot('cook');
      g.expect(st === 'cooking', 'anim ' + st);
      g.expect(
        face === want,
        `facing ${face} want ${want} (player ${pos.x},${pos.y} fire ${f.tile.x},${f.tile.y})`,
      );
      return `${vp}/${renderer}: anim ${st}, facing ${face} == toward fire ${want}`;
    },
  );

  await check('v2b', 'VFX: steam on a cooked item, dark puff on a burnt one', async () => {
    await resetMax(g);
    await g
      .waitFor(
        async () => {
          const m = await g.eval(`window.__vs.max`);
          return m.steam > 0 && m.burnt > 0;
        },
        { label: 'steam + burnt seen', timeoutMs: 12000 },
      )
      .catch(() => {});
    const m = await g.eval(`window.__vs.max`);
    const inv = await g.state('inventory.slots');
    const n = (id) => inv.filter((s) => s && s.itemId === id).reduce((a, s) => a + s.quantity, 0);
    g.expect(m.steam > 0, 'no steam ' + JSON.stringify(m));
    g.expect(
      m.burnt > 0,
      `no burnt puff ${JSON.stringify(m)} (cooked ${n('shrimps')} burnt ${n('burnt_fish')})`,
    );
    return `${vp}/${renderer}: steam max ${m.steam}, burnt-smoke max ${m.burnt}; bag shrimps ${n('shrimps')} burnt_fish ${n('burnt_fish')}`;
  });

  await check('v4a', 'dying look: smaller flames, embers, charred base, dimmer glow', async () => {
    // realTime for the DYING close-up: the hook clamps ticks to 30..600 ms (the old 3600000 was really 600), and
    // 6 ticks to burn-out must outlast the reads + screenshot (6 x 60 ms = 360 ms would not).
    await g.setTickMs(600);
    await g.update(
      `({ ...g, firemaking: { ...g.firemaking, fires: g.firemaking.fires.map((f) => ({ ...f, expiresAtTick: g.tick + 6 })) } })`,
    );
    await soft(
      g,
      async () =>
        (await g.eval(TEX('/^fire_embers/'))) === 1 &&
        (await g.eval(TEX('/^fire_base_dying/'))) === 1,
      'dying look',
      2500,
    );
    const f = await g.eval(FLAMES);
    const embers = await g.eval(TEX('/^fire_embers/'));
    const dyingBase = await g.eval(TEX('/^fire_base_dying/'));
    await shot('dying');
    g.expect(
      f.length === 3 && f[0][4] < root1 * 0.75,
      `root scale ${f[0] && f[0][4]} vs lit ${root1}`,
    );
    g.expect(embers === 1 && dyingBase === 1, `embers ${embers} charred base ${dyingBase}`);
    return `${vp}/${renderer}: root scale ${root1} -> ${f[0][4]}, embers visible ${embers}, charred base ${dyingBase}`;
  });

  await check(
    'v4b',
    'burn-out: flame view gone, ashes on the ground with the shared icon',
    async () => {
      await g.setTickMs(60);
      await g.waitFor(async () => (await fires(g)).length === 0, {
        label: 'burned out',
        timeoutMs: 15000,
      });
      await soft(
        g,
        async () =>
          (await g.eval(FLAMES)).length + (await g.eval(TEX('/^fire_(glow|base)/'))) === 0 &&
          (await g.eval(TEX('/^item_icon_ashes$/'))) >= 1,
        'fire view gone + ashes drawn',
        4000,
      );
      const left = (await g.eval(FLAMES)).length + (await g.eval(TEX('/^fire_(glow|base)/')));
      const gi = (await g.state('ground.items')).filter((i) => i.itemId === 'ashes');
      const key = await g.eval(
        `(async () => (await import('/src/render/itemIcons.ts')).itemIconSource('ashes').key)()`,
      );
      const img = await g.eval(TEX(`/^${'item_icon_ashes'}$/`));
      await shot('ashes');
      g.expect(left === 0, 'fire view parts left ' + left);
      g.expect(
        gi.length === 1 && key === 'item_icon_ashes' && img >= 1,
        `ashes ground ${gi.length}, key ${key}, images ${img}`,
      );
      return `${vp}/${renderer}: fire parts left 0, ground ashes ${gi.length}, scene image ${key} x${img}`;
    },
  );

  await check(
    'v5',
    'food icons: raw/cooked/burnt distinct, named, same icon in inventory + ground + bank',
    async () => {
      const BAG = [
        'raw_shrimp',
        'shrimps',
        'burnt_fish',
        'raw_chicken',
        'cooked_chicken',
        'burnt_meat',
        'raw_beef',
        'cooked_beef',
      ];
      const info = await g.eval(
        `(async () => { const { CONTENT } = await import('/src/app/registry.ts'); const I = await import('/src/render/itemIcons.ts');
          return ${JSON.stringify(BAG)}.map((id) => [id, CONTENT.items.get(id).name, CONTENT.items.get(id).examine, I.itemIconUrl(id)]); })()`,
      );
      const names = info.map((x) => x[1]);
      g.expect(
        names.every((n) => /^(Raw|Cooked|Burnt) /.test(n)) &&
          /^Raw/.test(names[0]) &&
          /^Cooked/.test(names[1]) &&
          /^Burnt/.test(names[2]),
        'names ' + names,
      );
      g.expect(new Set(info.map((x) => x[3])).size === BAG.length, 'icon urls not all distinct');
      await g.update(`({ ...g, firemaking: { ...g.firemaking, fires: [] } })`);
      await g.setInventory(BAG);
      await g.update(
        `({ ...g, bank: { ...g.bank, items: ${JSON.stringify(BAG.map((itemId) => ({ itemId, quantity: 1 })))} }, ground: { ...g.ground, items: [...g.ground.items, ...${JSON.stringify(
          BAG.map((itemId, i) => ({
            id: 'qa' + i,
            itemId,
            qty: 1,
            x: START.x + 1 + (i % 3),
            y: START.y + 1 + Math.floor(i / 3),
            spawnTick: 0,
            despawnTick: 9e9,
          })),
        )}] } })`,
      );
      await sheet(g, true);
      const src = (sel) =>
        g.eval(
          `[...document.querySelectorAll(${JSON.stringify(sel)})].map((i) => ({ s: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 }))`,
        );
      await soft(
        g,
        async () => {
          const l = await src('.slot-grid .slot-icon');
          return l.length === BAG.length && l.every((x) => x.ok);
        },
        'inventory icons loaded',
        4000,
      );
      await soft(
        g,
        () =>
          g.eval(
            `(() => { ${FLAT} return ${JSON.stringify(BAG)}.every((id) => all.some((o) => o.texture && o.texture.key === 'item_icon_' + id)); })()`,
          ),
        'ground icons drawn',
        4000,
      );
      const inv = await src('.slot-grid .slot-icon');
      g.expect(
        inv.length === BAG.length && inv.every((x, i) => x.s === info[i][3] && x.ok),
        'inventory icons ' + inv.length,
      );
      const gnd = await g.eval(
        `(() => { ${FLAT} return ${JSON.stringify(BAG)}.map((id) => all.filter((o) => o.texture && o.texture.key === 'item_icon_' + id).length); })()`,
      );
      g.expect(
        gnd.every((n) => n >= 1),
        'ground images per item ' + gnd,
      );
      await g.update(`({ ...g, bankOpen: true, bankMode: 'full' })`);
      await soft(
        g,
        async () => {
          const l = await src('[role=dialog] .slot-icon');
          return l.length >= BAG.length * 2 && l.every((x) => x.ok);
        },
        'bank icons loaded',
        4000,
      );
      const bank = await src('[role=dialog] .slot-icon');
      g.expect(
        bank.length >= BAG.length * 2 && bank.every((x) => x.ok),
        'bank icons ' + bank.length,
      );
      g.expect(
        BAG.every((_, i) => bank.some((x) => x.s === info[i][3])),
        'bank srcs differ from inventory',
      );
      await shot('bank-icons');
      await g.closeOverlays();
      await sheet(g, true);
      await shot('inventory-icons');
      // Examine on the burnt fish (slot 2) prints its examine text
      const m = await openMenu(g, 2);
      await pick(g, 'Examine');
      await soft(
        g,
        async () => (await g.eval(`window.__e.chat()`)).some((t) => t.includes(info[2][2])),
        'examine line',
        3000,
      );
      const chat = await g.eval(`window.__e.chat()`);
      g.expect(
        chat.some((t) => t.includes(info[2][2])),
        `examine text "${info[2][2]}" not in chat ${chat.slice(-2)}`,
      );
      return `${vp}/${renderer}: names [${names.join(' | ')}]; ${BAG.length} distinct urls; inventory ${inv.length} + bank ${bank.length} srcs match; ground images ${gnd}; menu ${m.labels}; examine ok`;
    },
  );
});
