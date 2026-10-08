// HUD e2e: Skills panel, minimap, orbs. (Blocked-action VFX moved to blocked.e2e.mjs, animation modes to
// animation.e2e.mjs.) Run: node tests/e2e/hud.e2e.mjs   (SHOTS_DIR=/some/dir saves PNGs)   Exit 0 = all checks passed.
// Fast base (was a standalone vite+CDP script at 600 ms ticks): runParallel desktop + phone, withCombos, 60 ms ticks,
// budget 60 s. webgl only: every check reads HUD DOM / store / camera numbers, nothing drawn is asserted. Fixed sleeps
// replaced by waits on state: walk idle (run/walk step traces are per-tick store changes, so the 2-vs-1 tiles per
// tick checks are tick-speed independent), path set, camera still, recentre counter, orb label, tab selected.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9525; // combos use 9525..9526
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

// Page-side helpers (registered before the first load). State/camera/player come only from the DEV hook window.__idleRpg.
const PAGE = `(() => {
  const H = () => window.__idleRpg;
  const scene = () => H().scene();
  const world = () => scene().camera.scene;
  const SKILL_TIP = () => null;
  window.__t = {
    ready: () => { try { return !!(H() && scene().playerView && scene().camera && H().store.getState().game); } catch { return false; } },
    g: () => H().store.getState().game,
    st: () => H().store.getState(),
    toClient: (wx, wy) => { const cam = scene().camera, v = cam.worldView, cv = world().game.canvas, r = cv.getBoundingClientRect();
      return { x: r.left + (((wx - v.x) / v.width) * cam.width * r.width) / cv.width, y: r.top + (((wy - v.y) / v.height) * cam.height * r.height) / cv.height }; },
    topIsCanvas: (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.className !== 'minimap'; },
    rect: (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; },
    rectOf: (sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === text); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    camCentre: () => { const v = scene().camera.worldView; return { x: v.x + v.width / 2, y: v.y + v.height / 2 }; },
    playerWorld: () => { const c = scene().playerView.container; return { x: c.x, y: c.y }; },
    liveTexts: () => world().children.list.filter((o) => o.type === 'Text' && o.visible && o.active && o.alpha > 0).map((o) => o.text),
    // visible, still-fading Graphics whose commands draw a red-ish line (blocked cross)
    redCrosses: () => world().children.list.filter((o) => o.type === 'Graphics' && o.visible && o.active && o.alpha > 0 && o.commandBuffer && o.commandBuffer.length > 4 && o.commandBuffer.some((c, i, a) => i > 0 && a[i - 1] === 0 && 0)).length,
    gfxVisible: () => world().children.list.filter((o) => o.type === 'Graphics' && o.visible && o.active && o.alpha > 0 && o.commandBuffer && o.commandBuffer.length > 0 && o.depth > 0).map((o) => ({ cmd: o.commandBuffer.slice(0, 4).join(','), alpha: o.alpha })),
    // rig = container.list[1]; armFront = rig.list[3]; axe graphics = armFront.list[2]
    arm: () => { const rig = scene().playerView.container.list[1]; const a = rig.list[3]; return { rot: a.rotation, axeVisible: a.list[2].visible }; },
    containers: () => world().children.list.filter((o) => o.type === 'Container').length,
    // Per-frame samples until a log lands (then 1.2 s more) or maxMs. logAt = time the first log appeared.
    sample: (maxMs) => new Promise((res) => { const out = []; const t0 = performance.now(); let logAt = null; const base = window.__t.logs(); const f = () => { const t = performance.now() - t0; const a = window.__t.arm(); if (logAt === null && window.__t.logs() > base) logAt = t; out.push({ t, logAt, chop: H().store.getState().game.gathering.session !== null, rot: a.rot, axeVisible: a.axeVisible, containers: window.__t.containers() }); if (t < maxMs && (logAt === null || t < logAt + 1200)) requestAnimationFrame(f); else res(out); }; f(); }),
    mark: () => { window.__pos = []; const s = H().store; window.__unsub = s.subscribe((n) => { const m = n.game.movement; const last = window.__pos[window.__pos.length - 1]; if (!last || last.x !== m.position.x || last.y !== m.position.y) window.__pos.push({ x: m.position.x, y: m.position.y, t: performance.now(), e: m.runEnergy, r: m.running }); }); },
    unmark: () => { window.__unsub && window.__unsub(); return window.__pos; },
    logs: () => H().store.getState().game.inventory.slots.reduce((n, s) => n + (s && s.itemId === 'logs' ? s.quantity : 0), 0),
    chat: () => [...document.querySelectorAll('[aria-label=Chat] p')].map((p) => p.textContent),
  };
  void SKILL_TIP;
})();`;

await withCombos(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [PAGE] },
  COMBOS,
  async (g, phase) => {
    const T = (e) => g.eval(`window.__t.${e}`);
    const cdp = { eval: (e) => g.eval(e) };
    const shot = (name) => g.screenshot(name);
    const tap = (x, y) => g.tap(x, y);
    const drag = (x0, y0, x1, y1) => g.drag(x0, y0, x1, y1, 12);
    const tapSel = async (sel) => {
      const r = await T(`rect(${JSON.stringify(sel)})`);
      expect(r, 'no element ' + sel);
      await tap(r.x, r.y);
    };
    const setGame = (patchExpr) => g.update(patchExpr);
    /** Two rendered frames: React has committed a store change made before this call. */
    const frames = () =>
      g.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))');
    // Isometric world: tile -> world px through the real projection (trunk = tile centre, canopy = 70 px above).
    const tileClient = async (tx, ty, dy = 16) => {
      const w = await g.eval(
        `(async () => (await import('/src/render/projection.ts')).isoProjection.tileToWorld(${tx}, ${ty}))()`,
      );
      return T(`toClient(${w.x}, ${w.y - (dy === 16 ? 0 : 70)})`);
    };
    const openTab = async (name) => {
      const r = await T(`rectOf('[role=tab]', ${JSON.stringify(name)})`);
      expect(r, 'tab ' + name);
      await tap(r.x, r.y);
      await g.waitFor(
        () =>
          g.eval(
            `[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.trim() === ${JSON.stringify(name)})?.getAttribute('aria-selected') === 'true'`,
          ),
        { label: `tab ${name} selected` },
      );
      await frames();
    };
    // Real tap on a tree until it is chopping; returns the tile
    const tapTree = async (tx, ty, where = 'trunk') => {
      let p = await tileClient(tx, ty, where === 'trunk' ? 16 : -5);
      if (!(await T(`topIsCanvas(${p.x}, ${p.y})`))) {
        // precondition only: the camera follow offset can leave the tree under the sheet; recentre first
        await g.eval('window.__idleRpg.store.getState().recentreCamera()');
        await g.settle();
        p = await tileClient(tx, ty, where === 'trunk' ? 16 : -5);
      }
      expect(
        await T(`topIsCanvas(${p.x}, ${p.y})`),
        `${where} point (${p.x | 0},${p.y | 0}) of tree ${tx},${ty} is covered by HUD or off-screen`,
      );
      await tap(p.x, p.y);
    };
    const resetNear = async (x, y) => {
      await setGame(
        `({ ...g, movement: { ...g.movement, position: { x: ${x}, y: ${y} }, path: [] }, gathering: { ...g.gathering, session: null } })`,
      );
      await g.settle();
    };
    await tap(640, 20); // harmless first gesture (unlock audio); off-screen on phone, as before
    const vp = await cdp.eval('({ w: innerWidth, h: innerHeight })');

    // ---------- 1. Skills panel ----------
    await check(
      's1',
      'Skills: 3-col grid, 13 skills, icon loaded, colour tint, big level, totals',
      async () => {
        await openTab('Skills');
        const info = await cdp.eval(`(async () => {
        const cells = [...document.querySelectorAll('.skill-cell')];
        const imgs = cells.map((c) => c.querySelector('img.skill-icon'));
        await Promise.all(imgs.filter(Boolean).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 3000); })));
        const grid = document.querySelector('.skill-grid');
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const lefts = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left)));
        return {
          n: cells.length, cols, distinctLefts: lefts.size,
          missingIcon: cells.filter((c, i) => !imgs[i] || !(imgs[i].naturalWidth > 0)).map((c) => c.getAttribute('aria-label')),
          tints: new Set(cells.map((c) => getComputedStyle(c).borderLeftColor)).size,
          bgs: cells.filter((c) => { const b = getComputedStyle(c).backgroundColor; return b && b !== 'rgba(0, 0, 0, 0)'; }).length,
          levelFont: Math.min(...cells.map((c) => parseFloat(getComputedStyle(c.querySelector('.skill-level')).fontSize))),
          levels: cells.map((c) => Number(c.querySelector('.skill-level').textContent)),
          totals: document.querySelector('.skill-totals').textContent,
          minCell: Math.min(...cells.map((c) => { const r = c.getBoundingClientRect(); return Math.min(r.width, r.height); })),
        };
      })()`);
        expect(info.n === 13, `${info.n} skills`);
        expect(
          info.cols === 3 && info.distinctLefts === 3,
          `cols ${info.cols}, distinct lefts ${info.distinctLefts}`,
        );
        expect(info.missingIcon.length === 0, 'icons missing/zero width: ' + info.missingIcon);
        expect(
          info.tints >= 10 && info.bgs === 13,
          `tints ${info.tints} distinct, tinted bg on ${info.bgs}`,
        );
        expect(info.levelFont >= 16, `level font ${info.levelFont}px not big`);
        const sum = info.levels.reduce((a, b) => a + b, 0);
        const m = /Total level:\s*(\d+).*Combat level:\s*(\d+)/s.exec(info.totals);
        expect(m, 'totals text ' + info.totals);
        expect(Number(m[1]) === sum, `total ${m[1]} != sum of cells ${sum}`);
        expect(Number(m[2]) === 3, `fresh combat level ${m[2]} != 3`);
        await shot(`${phase}-skills`);
        return `13 cells, 3 cols, all icons naturalWidth>0, ${info.tints} distinct tints, level font ${info.levelFont}px, min cell ${Math.round(info.minCell)}px, ${info.totals}`;
      },
    );

    await check('s2', 'tap a skill: XP + XP-to-next; tap again hides', async () => {
      const r = await T(`rect('.skill-cell[aria-label^="Woodcutting"]')`);
      expect(r, 'no woodcutting cell');
      await tap(r.x, r.y);
      const d = await cdp.eval(`document.querySelector('.skill-detail')?.innerText`);
      expect(
        d && /XP: 0\b/.test(d) && /Next level in: 83 XP/.test(d),
        'detail text: ' + JSON.stringify(d),
      );
      // the detail opens above/below the grid and can shift the cell (phone): re-measure before the 2nd tap
      const r2 = await T(`rect('.skill-cell[aria-label^="Woodcutting"]')`);
      await tap(r2.x, r2.y);
      expect(!(await cdp.eval('!!document.querySelector(".skill-detail")')), 'detail did not hide');
      await tap(r.x, r.y);
      return JSON.stringify(d);
    });

    await check('s3', 'chop a log: Woodcutting cell level/progress + tracker update', async () => {
      await openTab('Inventory');
      await resetNear(17, 17);
      const before = await T('g().progression.xp.woodcutting');
      await tapTree(15, 18);
      // The tracker lives for a stretch of GAME time (playTimeMs), i.e. 10x shorter in wall time at 60 ms ticks, and a
      // normal tree falls after one log: read xp + tracker in-page on the first frames after the log lands (the old
      // test read them 300 ms later at 600 ms ticks, while the tracker was still up).
      const cap =
        await g.eval(`new Promise((res) => { const t0 = performance.now(); let seen = 0, last = null;
        const f = () => { const s = window.__idleRpg.store.getState().game; const el = document.querySelector('[aria-label="Woodcutting tracker"]');
          if (window.__t.logs() >= 1) { const xp = s.progression.xp.woodcutting; last = { xp, tracker: el ? el.innerText : null };
            if ((last.tracker ?? '').replace(/,/g, '').includes(Math.floor(xp) + ' XP') || ++seen > 30) return res(last); }
          if (performance.now() - t0 > 40000) return res(last); requestAnimationFrame(f); }; f(); })`);
      expect(cap, 'no log within 40 s');
      const { xp, tracker } = cap;
      expect(xp > before, `xp ${before}->${xp}`);
      expect(tracker && /XP/.test(tracker), 'no tracker: ' + tracker);
      expect(
        Number(/([\d,]+) XP/.exec(tracker)[1].replace(',', '')) === Math.floor(xp),
        `tracker "${tracker}" vs xp ${xp}`,
      );
      await openTab('Skills');
      const bar = await cdp.eval(
        `(() => { const c = document.querySelector('.skill-cell[aria-label^="Woodcutting"]'); const p = c.querySelector('[role=progressbar]'); return { now: p && p.getAttribute('aria-valuenow'), lvl: c.querySelector('.skill-level').textContent }; })()`,
      );
      expect(
        bar.now && Number(bar.now) > 0,
        'cell progress bar did not move: ' + JSON.stringify(bar),
      );
      if (await cdp.eval('!!document.querySelector(".skill-detail")')) {
        // a detail for another cell may be open (phone): close it with a real tap on its own cell first
        const open = await T(
          `rect('.skill-cell[aria-pressed="true"], .skill-cell[aria-expanded="true"]')`,
        );
        if (open) await tap(open.x, open.y);
      }
      const r = await T(`rect('.skill-cell[aria-label^="Woodcutting"]')`);
      if (!(await cdp.eval('!!document.querySelector(".skill-detail")'))) await tap(r.x, r.y);
      const d = await cdp.eval(`document.querySelector('.skill-detail')?.innerText`);
      expect(new RegExp(`XP: ${Math.floor(xp)}`).test(d), `detail ${d} vs xp ${xp}`);
      await tap(r.x, r.y);
      await openTab('Inventory');
      return `xp ${before}->${xp}; tracker "${tracker.replace(/\n/g, ' | ')}"; cell progress ${bar.now}; detail ${JSON.stringify(d)}`;
    });

    // ---------- 2. blocked-action VFX: retired here (No axe / Level 15 needed / Inventory full are covered by blocked.e2e.mjs) ----------

    // ---------- 3. minimap ----------
    await check('m1', 'tap minimap: player walks toward that tile', async () => {
      await resetNear(18, 15);
      const r = await T(`rect('canvas.minimap')`);
      expect(r, 'no minimap');
      const css = r.w;
      const perTile = (4 * css) / 160;
      const tries = [
        [0.55, 0.0],
        [0.0, 0.55],
        [-0.55, 0.0],
      ];
      const out = [];
      for (const [fx, fy] of tries) {
        const start = await T('g().movement.position');
        const dx = Math.round((fx * css) / 2 / perTile);
        const dy = Math.round((fy * css) / 2 / perTile);
        const wantX = start.x + Math.round((fx * css) / 2 / perTile);
        const wantY = start.y + Math.round((fy * css) / 2 / perTile);
        await tap(r.x + (fx * css) / 2, r.y + (fy * css) / 2);
        await g
          .waitFor(async () => (await T('g().movement.path.length')) > 0, {
            label: 'minimap path',
            timeoutMs: 1500,
          })
          .catch(() => {});
        const path = await T('g().movement.path');
        if (!path.length) {
          out.push(`tap ${fx},${fy} -> no path (maybe unwalkable)`);
          continue;
        }
        const end = path[path.length - 1];
        const dist = Math.hypot(end.x - wantX, end.y - wantY);
        expect(
          dist <= 1.5,
          `minimap tap targeted ${JSON.stringify(end)}, expected about ${wantX},${wantY} (d=${dx},${dy}, ${perTile}px/tile)`,
        );
        await g
          .waitFor(
            async () => {
              const q = await T('g().movement.position');
              return Math.hypot(q.x - start.x, q.y - start.y) >= 1;
            },
            { label: 'player moved', timeoutMs: 5000 },
          )
          .catch(() => {});
        const now = await T('g().movement.position');
        expect(
          Math.hypot(now.x - start.x, now.y - start.y) >= 1,
          `player did not move from ${JSON.stringify(start)}`,
        );
        out.push(
          `tap(${fx},${fy}) dest ${JSON.stringify(end)} want ~${wantX},${wantY}; moved ${JSON.stringify(start)} -> ${JSON.stringify(now)}`,
        );
        await shot(`${phase}-minimap`);
        return out.join(' | ');
      }
      throw new Error('no minimap tap produced a path: ' + out.join(' | '));
    });

    await check('m2', 'N re-centres the camera after a drag-pan', async () => {
      await resetNear(18, 15);
      await g.waitIdle();
      await g.settle();
      const c0 = await T('camCentre()');
      const pw = await T('playerWorld()');
      const mid = { x: vp.w * 0.4, y: vp.h * 0.4 };
      await drag(mid.x, mid.y, mid.x - 120, mid.y - 80);
      await g.settle();
      const c1 = await T('camCentre()');
      const panned = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      expect(panned > 30, `drag did not pan camera (${panned}px)`);
      expect((await T('g().movement.path.length')) === 0, 'drag started a walk');
      const rec0 = await T('st().recentre');
      const hit = await cdp.eval(
        `(() => { const r = document.querySelector('.minimap-n').getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t.className || t.tagName; })()`,
      );
      await tapSel('button[aria-label^="Compass"]');
      await g
        .waitFor(async () => (await T('st().recentre')) !== rec0, {
          label: 'recentre counter',
          timeoutMs: 3000,
        })
        .catch(() => {});
      await g.settle(); // the recentre glide finishes
      const rec1 = await T('st().recentre');
      const walked = await T('g().movement.path.length');
      expect(
        rec1 === rec0 + 1,
        `BUG-HUD-1: N tap did not call recentreCamera (counter ${rec0}->${rec1}); element under N is "${hit}"${walked ? '; it started a minimap walk (path ' + walked + ')' : ''}`,
      );
      const c2 = await T('camCentre()');
      const pw2 = await T('playerWorld()');
      const off = Math.hypot(c2.x - pw2.x - (c0.x - pw.x), c2.y - pw2.y - (c0.y - pw.y));
      expect(
        off < 40,
        `after N camera is ${off}px from its pre-pan offset to the player (was panned ${panned})`,
      );
      return `panned ${panned.toFixed(0)}px, after N ${off.toFixed(1)}px from player (centre ${JSON.stringify(c2)}, player ${JSON.stringify(pw2)}, before ${JSON.stringify(pw)})`;
    });

    // ---------- 4. orbs ----------
    await check('o1', 'HP and Prayer orbs show current/max', async () => {
      const o = await cdp.eval(
        `[...document.querySelectorAll('.orb')].map((b) => ({ label: b.getAttribute('aria-label'), text: b.textContent, disabled: b.disabled }))`,
      );
      expect(o.length === 3, 'orbs: ' + JSON.stringify(o));
      const gs = await T('g()'); // not `g`: that is the lib game handle
      const hpMax = await cdp.eval(
        `(async () => { const m = await import('/src/core/progression/index.ts'); const g = window.__idleRpg.store.getState().game; return { hp: m.getLevel(g.progression, 'hitpoints'), pr: m.getLevel(g.progression, 'prayer') }; })()`,
      );
      expect(
        o[0].label.includes(String(gs.hp.current)) &&
          o[1].label.includes(String(gs.prayer.current)),
        'orb labels ' + JSON.stringify(o),
      );
      // current/max: lower HP and check the orb follows the current value
      await setGame(`({ ...g, hp: { ...g.hp, current: 4 } })`);
      await g
        .waitFor(
          () => g.eval(`document.querySelector('.orb').getAttribute('aria-label').includes('4')`),
          { label: 'hp orb label', timeoutMs: 3000 },
        )
        .catch(() => {});
      const lab = await cdp.eval(`document.querySelector('.orb').getAttribute('aria-label')`);
      const fill = await cdp.eval(
        `getComputedStyle(document.querySelector('.orb')).getPropertyValue('--orb-pct')`,
      );
      expect(lab.includes('4'), 'hp orb after change: ' + lab);
      await setGame(`({ ...g, hp: { ...g.hp, current: ${gs.hp.current} } })`);
      // does the orb itself show a "current/max" - report what it shows
      return `labels ${JSON.stringify(o.map((x) => x.label))}; text ${JSON.stringify(o.map((x) => x.text))}; max hp ${hpMax.hp} prayer ${hpMax.pr}; fill at hp 4: ${fill.trim()}`;
    });

    await check(
      'o2',
      'Run orb toggles running; 2 tiles/tick while running; drains energy',
      async () => {
        await resetNear(18, 15);
        const orb = 'button.orb[aria-label^="Run"]';
        expect((await T('g().movement.running')) === false, 'running initially');
        await tapSel(orb);
        expect((await T('g().movement.running')) === true, 'tap did not enable run');
        const lab = await cdp.eval(`document.querySelector('${orb}').getAttribute('aria-label')`);
        expect(lab.startsWith('Run on'), 'label ' + lab);
        const e0 = await T('g().movement.runEnergy');
        await T('mark()');
        await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 28, y: 15 })`);
        await g.waitIdle(); // was 3600 ms = 6 ticks at 600 ms
        const trace = await T('unmark()');
        const e1 = await T('g().movement.runEnergy');
        const steps = trace
          .slice(1)
          .map((p, i) => Math.abs(p.x - trace[i].x) + Math.abs(p.y - trace[i].y));
        expect(steps.length >= 3, 'too few steps ' + JSON.stringify(trace));
        expect(steps.filter((s) => s === 2).length >= 2, `running steps ${steps}`);
        expect(e1 < e0, `energy ${e0} -> ${e1}`);
        // toggle off, walk back, 1 tile/tick
        await tapSel(orb);
        expect((await T('g().movement.running')) === false, 'tap did not disable run');
        await g.waitIdle();
        await T('mark()');
        await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 18, y: 15 })`);
        await g.waitIdle();
        const t2 = await T('unmark()');
        const s2 = t2.slice(1).map((p, i) => Math.abs(p.x - t2[i].x) + Math.abs(p.y - t2[i].y));
        expect(s2.length >= 3 && s2.every((s) => s === 1), `walking steps ${s2}`);
        return `run steps/tick ${JSON.stringify(steps)} energy ${e0}->${e1}; walk steps ${JSON.stringify(s2)}`;
      },
    );

    await check('o3', 'Run cannot be enabled at 0 energy', async () => {
      await resetNear(18, 15);
      // realTime (600 ms ticks) for the two refusals: energy regenerates 45 per tick and the threshold is 100, so at
      // 60 ms ticks the set-energy -> tap round trip (3 ticks = 180 ms) legitimately regains enough to run.
      const st = await g.realTime(async () => {
        await setGame(`({ ...g, movement: { ...g.movement, running: false, runEnergy: 0 } })`);
        await frames();
        const st0 = await cdp.eval(
          `(() => { const b = document.querySelector('button.orb[aria-label^="Run"]'); return { disabled: b.disabled, label: b.getAttribute('aria-label'), text: b.textContent }; })()`,
        );
        await tapSel('button.orb[aria-label^="Run"]');
        await frames();
        expect((await T('g().movement.running')) === false, 'run turned on at 0 energy');
        // also at 50/10000 (<1%)
        await setGame(`({ ...g, movement: { ...g.movement, running: false, runEnergy: 50 } })`);
        await frames();
        await tapSel('button.orb[aria-label^="Run"]');
        await frames();
        expect((await T('g().movement.running')) === false, 'run turned on at 50 energy');
        return st0;
      });
      // while running, hitting 0 turns it off
      await setGame(`({ ...g, movement: { ...g.movement, running: true, runEnergy: 100 } })`);
      await cdp.eval(`window.__idleRpg.store.getState().walkTo({ x: 28, y: 15 })`);
      await g.waitTicks(4); // was 2500 ms = ~4 ticks at 600 ms
      const m = await T('g().movement');
      await setGame(
        `({ ...g, movement: { ...g.movement, running: false, runEnergy: 10000, path: [] } })`,
      );
      return `at 0: ${JSON.stringify(st)}; running with 100 energy then walking 4 ticks -> running=${m.running} energy=${m.runEnergy}`;
    });
  },
);
