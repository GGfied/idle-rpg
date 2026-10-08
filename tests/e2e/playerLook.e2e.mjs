// QA slice 13: Settings Character Male/Female. Real taps in Settings; world view, walk, chop, dialogue portrait, reload, back to male.
// Port 5238 (E2E_PORT overrides, mutant 5338). SHOTS_DIR default tests/e2e/.shots-playerLook.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const SHOTS = process.env.SHOTS_DIR ?? resolve(process.cwd(), 'tests/e2e/.shots-playerLook');
const PAGE = `(() => {
  const H = window.__idleRpg, pv = () => H.scene().playerView;
  window.__L = {
    kids: () => pv().container.list.length,
    grp: () => [...document.querySelectorAll('[role=radiogroup]')].find((r) => document.getElementById(r.getAttribute('aria-labelledby'))?.textContent === 'Character'),
    btn: (t) => [...window.__L.grp().querySelectorAll('[role=radio]')].find((b) => b.textContent === t),
    sel: () => [...window.__L.grp().querySelectorAll('[role=radio]')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent),
    // hair pixels: auburn-ish (r > g > b, r >= 110, r-b >= 50) fraction in a clip of the screenshot is computed node-side
    lane: async (dx, dy, K) => {
      const w = await import('/src/features/world/index.ts'); const grid = w.createWorldCollisionGrid();
      const p = H.store.getState().game.movement.position;
      for (let r = 0; r <= 30; r++) for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        let ok = true; const s = { x: p.x + ox, y: p.y + oy };
        for (let i = 0; i <= K && ok; i++) ok = grid.isWalkable(s.x + dx * i, s.y + dy * i);
        if (ok) return { start: s, end: { x: s.x + dx * K, y: s.y + dy * K } };
      }
      return null;
    },
    player: () => { const c = pv().container; return window.__e.toClient(c.x, c.y); },
    // visible Graphics with drawn commands anywhere under the player container (arms/axe)
    gfx: () => { let n = 0; const walk = (o, vis) => { const v = vis && o.visible; if (o.type === 'Graphics' && v && o.commandBuffer?.length > 0) n++; o.list?.forEach((c) => walk(c, v)); }; walk(pv().container, true); return n; },
    axeShown: () => { let hit = 0; const walk = (o, vis) => { const v = vis && o.visible; if (o.type === 'Graphics' && v && o.commandBuffer?.length > 20 && o.parentContainer && (o.parentContainer.name === 'armFrontFore' || o.parentContainer.parentContainer?.type === 'Container' && o.parentContainer.list.length === 1)) hit++; o.list?.forEach((c) => walk(c, v)); }; walk(pv().container, true); return hit; },
  };
})()`;

async function shot(g, name) {
  const p = await g.eval('window.__L.player()');
  const clip = {
    x: Math.max(0, p.x - 45),
    y: Math.max(0, p.y - 110),
    width: 90,
    height: 130,
    scale: 5,
  };
  const { data } = await g.cdp.send('Page.captureScreenshot', { format: 'png', clip });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.viewportName}-${name}.png`), Buffer.from(data, 'base64'));
  return data;
}
/** count auburn hair-ish px and decode via in-page canvas */
const hairPx = (g, b64) =>
  g.eval(`(async () => { const i = new Image(); i.src = 'data:image/png;base64,${b64}'; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let k = 0; k < d.length; k += 4) { const r = d[k], gg = d[k + 1], b = d[k + 2]; if (r >= 90 && r >= gg * 1.75 && gg >= b * 0.8) n++; }
    return n; })()`);

async function openSettings(g) {
  if (!(await g.eval('!!window.__L.grp()'))) {
    await g.tapSelector('button[aria-label="Settings"]');
    await g.waitFor(() => g.eval('!!window.__L.grp()'), { label: 'Character row' });
  }
}
async function pick(g, text) {
  await openSettings(g);
  await g.eval(`window.__L.btn(${JSON.stringify(text)}).scrollIntoView({block:'center'})`);
  const r = await g.eval(
    `(() => { const r = window.__L.btn(${JSON.stringify(text)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  await g.tap(r.x, r.y);
  await g.sleep(500);
}
const closeSettings = (g) => g.eval(`window.__idleRpg.store.setState({ settingsOpen: false })`);
const look = (g) => g.store('s.prefs.playerLook');
const portrait = (g) => g.eval(`document.querySelector('.dialogue-avatar-img')?.src ?? null`);

async function walkLane(g, dx, dy, name) {
  const lane = await g.eval(`window.__L.lane(${dx}, ${dy}, 5)`);
  expect(lane, 'no lane');
  await g.teleport(lane.start.x, lane.start.y);
  await g.walkTo(lane.end.x, lane.end.y);
  await g.waitFor(
    async () => {
      const p = await g.state('movement.position');
      return p.x === lane.end.x && p.y === lane.end.y;
    },
    { label: 'walk end', timeoutMs: 20000 },
  );
  await g.sleep(500);
  return shot(g, name);
}

await withGame(
  { port: 5238 },
  forEachViewport(['desktop', 'phone'], async (g) => {
    await g.eval(PAGE);
    let base = 0;
    await check('c1', 'Character row: Male/Female, Male default, targets >=44px', async () => {
      await openSettings(g);
      const sel = await g.eval('window.__L.sel()');
      expect(sel.length === 1 && sel[0] === 'Male', `selected ${sel}`);
      const sz = await g.eval(
        `['Male','Female'].map((t) => { const r = window.__L.btn(t).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`,
      );
      expect(
        sz.every(([w, h]) => w >= 44 && h >= 44),
        `sizes ${JSON.stringify(sz)}`,
      );
      expect((await look(g)) === 'player', `pref ${await look(g)}`);
      base = await g.eval('window.__L.kids()');
      return `selected Male, sizes ${JSON.stringify(sz)}, children ${base}`;
    });
    let maleShot;
    await check('c2a', 'male baseline close-up (front)', async () => {
      await closeSettings(g);
      maleShot = await walkLane(g, 0, 1, 'male-front');
      return `male auburn px ${await hairPx(g, maleShot)}`;
    });
    await check(
      'c2',
      'tap Female: world look switches live, auburn hair front + back, no reload',
      async () => {
        await g.eval('window.__noReload = 1');
        await pick(g, 'Female');
        expect((await look(g)) === 'player_f', `pref ${await look(g)}`);
        expect((await g.eval('window.__L.sel()'))[0] === 'Female', 'radio not Female');
        await closeSettings(g);
        const front = await walkLane(g, 0, 1, 'female-front');
        const back = await walkLane(g, 0, -1, 'female-back');
        const m = await hairPx(g, maleShot),
          f = await hairPx(g, front),
          b = await hairPx(g, back);
        expect(await g.eval('window.__noReload === 1'), 'page reloaded');
        expect(f > m + 80 && b > m + 80, `auburn px male ${m} female front ${f} back ${b}`);
        return `auburn px male ${m}, female front ${f}, back ${b}`;
      },
    );
    await check('c3', 'walk while Female: limbs animate, no child leak', async () => {
      const lane = await g.eval(`window.__L.lane(1, 0, 5)`);
      await g.teleport(lane.start.x, lane.start.y);
      const k0 = await g.eval('window.__L.kids()');
      await g.eval(`(() => { window.__rot = new Set(); const c = window.__idleRpg.scene().playerView.container; const rig = c.list.find((o) => o.type === 'Container' && o.list.length === 4);
        const t = setInterval(() => window.__rot.add(Math.round(rig.list[1].rotation * 100)), 16); window.__rotT = t; })()`);
      await g.walkTo(lane.end.x, lane.end.y);
      await g.waitFor(async () => (await g.state('movement.position')).x === lane.end.x, {
        label: 'walk',
        timeoutMs: 20000,
      });
      const distinct = await g.eval('(clearInterval(window.__rotT), window.__rot.size)');
      const k1 = await g.eval('window.__L.kids()');
      expect(k0 === k1 && k1 === base, `children base ${base} ${k0} -> ${k1}`);
      expect(distinct >= 6, `thigh rotation distinct values ${distinct}`);
      return `children ${k1}, thigh angle values ${distinct}`;
    });
    await check('c4', 'chop while Female: axe drawn, xp rises', async () => {
      await g.setInventory(['bronze_axe']);
      const tree = await g.targetOfKind('tree');
      await g.teleport(tree.x, tree.y + 3);
      const xp0 = await g.state('progression.xp.woodcutting');
      await g.tapObject(tree.id);
      let axe = 0;
      await g.waitFor(
        async () => {
          axe = Math.max(axe, await g.eval('window.__L.gfx()'));
          return (await g.state('progression.xp.woodcutting')) > xp0;
        },
        { label: 'xp rise', timeoutMs: 25000, intervalMs: 20 },
      );
      const xp1 = await g.state('progression.xp.woodcutting');
      expect(axe >= 1, `no drawn arm/axe graphics (${axe})`);
      expect((await look(g)) === 'player_f', 'look changed');
      await g.sleep(400);
      await shot(g, 'female-chop');
      return `xp ${xp0} -> ${xp1}, max drawn graphics ${axe}`;
    });
    let fPortrait;
    const talk = async () => {
      const banker =
        (await g.targets()).find((t) => t.id.includes('banker') && t.kind === 'npc') ??
        (await g.targetOfKind('npc'));
      await g.teleport(banker.x + 2, banker.y + 2);
      await g.tapObject(banker.id);
      for (
        let i = 0;
        i < 8 && !(await g.eval(`!!document.querySelector('.dialogue-choice')`));
        i++
      ) {
        if (await g.eval(`!!document.querySelector('.dialogue-main')`))
          await g.tapSelector('.dialogue-main');
        await g.sleep(150);
      }
      await g.waitFor(() => g.eval(`!!document.querySelector('.dialogue-choice')`), {
        label: 'choice node',
      });
      return portrait(g);
    };
    await check('c5', 'dialogue portrait is the female face (differs from male)', async () => {
      fPortrait = await talk();
      await g.eval(`window.__idleRpg.store.getState().closeDialogue()`);
      await pick(g, 'Male');
      await closeSettings(g);
      const mPortrait = await talk();
      await g.eval(`window.__idleRpg.store.getState().closeDialogue()`);
      expect(
        fPortrait?.startsWith('data:') && mPortrait?.startsWith('data:'),
        `portraits ${String(fPortrait).slice(0, 30)} / ${String(mPortrait).slice(0, 30)}`,
      );
      expect(fPortrait !== mPortrait, 'female and male portraits identical');
      await pick(g, 'Female');
      await closeSettings(g);
      const again = await talk();
      await g.eval(`window.__idleRpg.store.getState().closeDialogue()`);
      expect(again === fPortrait, 'female portrait not stable after toggle');
      return `female len ${fPortrait.length}, male len ${mPortrait.length}, differ, female stable`;
    });
    await check('c6', 'reload keeps Female (pref + world hair)', async () => {
      await g.sleep(500);
      await g.cdp.send('Page.reload');
      await g.waitFor(() => g.page('ready()').catch(() => false), {
        label: 'ready',
        timeoutMs: 25000,
      });
      await g.sleep(1200);
      await g.eval(PAGE);
      expect((await look(g)) === 'player_f', `pref ${await look(g)}`);
      await openSettings(g);
      expect((await g.eval('window.__L.sel()'))[0] === 'Female', 'radio not Female after reload');
      await closeSettings(g);
      await g.sleep(300);
      const px = await hairPx(g, await shot(g, 'female-after-reload'));
      expect(px > 80, `auburn px after reload ${px}`);
      return `pref player_f, auburn px ${px}`;
    });
    await check('c7', 'back to Male: male look returns, no leak', async () => {
      await pick(g, 'Male');
      await closeSettings(g);
      await g.sleep(300);
      const px = await hairPx(g, await shot(g, 'male-again'));
      const k = await g.eval('window.__L.kids()');
      expect((await look(g)) === 'player', 'pref not player');
      expect(k === base, `children ${base} -> ${k}`);
      expect(px < 30, `auburn px ${px} (female hair still shown?)`);
      return `pref player, auburn px ${px}, children ${k}`;
    });
  }),
);
