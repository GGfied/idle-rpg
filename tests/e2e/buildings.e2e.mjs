/* global console */
// Buildings with roofs: roof/front-wall fade on entering, instant when Animations Off, depth, no duplicate walls, bank from inside.
import process from 'node:process';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const B = {
  willowbrook_bank: { door: [13, 14], in: [13, 11], rect: { x: 9, y: 7, w: 9, h: 8 } },
  old_hut: { door: [27, 8], in: [27, 6], rect: { x: 24, y: 4, w: 7, h: 5 } },
  fernhaven_bank: { door: [94, 67], in: [94, 64], rect: { x: 90, y: 60, w: 9, h: 8 } },
};
const st = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.buildings.state(${JSON.stringify(id)})`);
const pos = (g) => g.state('movement.position');
const close = (a, b) => Math.abs(a - b) < 0.011;
const walkTo = async (g, x, y) => {
  await g.tapTile(x, y);
  await g.waitFor(
    async () => {
      const p = await pos(g);
      return p.x === x && p.y === y;
    },
    { timeoutMs: 20000, label: `reach ${x},${y}` },
  );
  await g.sleep(500);
};

await withGame(
  { port: 5211 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    for (const [id, b] of Object.entries(B)) {
      const [dx, dy] = b.door;
      await g.teleport(dx + 3, dy + 3, { settleMs: 1500 });
      await g.update(`({ ...g, bankOpen: false })`);
      await check(`out-${id}`, `${id}: outside roof 1 / walls 1`, async () => {
        const s = await st(g, id);
        expect(s && s.roofAlpha === 1 && s.frontWallAlpha === 1 && !s.inside, JSON.stringify(s));
        await g.screenshot(`${vp}-${id}-outside`);
        return JSON.stringify(s);
      });
      await check(`in-${id}`, `${id}: tap door, tap interior -> roof 0, walls 0.2`, async () => {
        await walkTo(g, dx, dy);
        await walkTo(g, ...b.in);
        const s = await st(g, id);
        expect(
          s.inside && close(s.roofAlpha, 0) && close(s.frontWallAlpha, 0.2),
          JSON.stringify(s),
        );
        await g.screenshot(`${vp}-${id}-inside`);
        return `${JSON.stringify(s)} pos ${JSON.stringify(await pos(g))}`;
      });
      await check(`vis-${id}`, `${id}: booths/npcs visible inside`, async () => {
        const r =
          await g.eval(`(() => { const sc = window.__idleRpg.scene().camera.scene; let n = 0, vis = 0;
          const walk = (l) => l.forEach((o) => { if (o.type === 'Container') walk(o.list); else if (o.type === 'Text' && o.text === 'Banker') { n++; if (o.visible && o.alpha > 0 && o.parentContainer?.visible !== false && o.parentContainer?.alpha !== 0) vis++; } });
          walk(sc.children.list); return { n, vis }; })()`);
        if (id !== 'old_hut') expect(r.vis >= 2, JSON.stringify(r));
        return JSON.stringify(r);
      });
      await check(`out2-${id}`, `${id}: leaving restores 1/1`, async () => {
        await walkTo(g, dx, dy - 1);
        await walkTo(g, dx, dy);
        await walkTo(g, dx, dy + 2);
        await g.waitFor(async () => (await st(g, id)).roofAlpha === 1, { label: 'roof back' });
        await g.sleep(700);
        const s = await st(g, id);
        expect(s.roofAlpha === 1 && s.frontWallAlpha === 1 && !s.inside, JSON.stringify(s));
        return JSON.stringify(s);
      });
      await check(
        `walls-${id}`,
        `${id}: one wall block per shell tile, interior counters drawn`,
        async () => {
          const r = await g.eval(`(async () => {
          const { isoProjection: P } = await import('/src/render/projection.ts'); const W = await import('/src/features/world/index.ts');
          const sc = window.__idleRpg.scene().camera.scene; const imgs = sc.children.list.filter((o) => o.type === 'Image');
          const b = ${JSON.stringify(b.rect)}; const out = { shellDup: [], shellMissing: [], counters: 0, counterMissing: [], shell: 0 };
          const door = ${JSON.stringify(b.door)};
          for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
            const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
            const p = P.tileToWorld(x, y); const n = imgs.filter((o) => Math.abs(o.x - p.x) < 1 && Math.abs(o.y - p.y) < 1).length;
            if (edge) { out.shell++; if (n > 1) out.shellDup.push([x, y, n]); if (n === 0 && !(x === door[0] && y === door[1]) && y !== b.y) out.shellMissing.push([x, y]); }
            else if (W.terrainAt(x, y) === 'wall') { out.counters++; if (n < 1) out.counterMissing.push([x, y]); else if (n > 1) out.shellDup.push([x, y, n]); }
          } return out; })()`);
          expect(!r.shellDup.length && !r.counterMissing.length, JSON.stringify(r));
          return JSON.stringify(r);
        },
      );
      await check(
        `behind-${id}`,
        `${id}: player north of building drawn behind roof/walls`,
        async () => {
          await g.teleport(dx, b.rect.y - 2);
          const r =
            await g.eval(`(() => { const h = window.__idleRpg.scene(); const sc = h.camera.scene;
          const s = sc.buildings.state(${JSON.stringify(id)}); const imgs = sc.children.list.filter((o) => o.type === 'Image' && String(o.texture.key).startsWith('bld_wall'));
          const nearWalls = imgs.filter((o) => Math.abs(o.depth - h.playerView.container.depth) < 1e9 && o.depth > h.playerView.container.depth).length;
          return { player: h.playerView.container.depth, roof: s.roofDepth, wallsAbove: nearWalls, walls: imgs.length }; })()`);
          expect(r.player < r.roof && r.wallsAbove >= 4, JSON.stringify(r));
          await g.screenshot(`${vp}-${id}-north`);
          return JSON.stringify(r);
        },
      );
    }

    await check('anim-off', 'Animations Off: roof/wall change is instant (On is not)', async () => {
      const [dx, dy] = B.willowbrook_bank.door;
      await g.teleport(dx, dy + 3);
      const mid =
        await g.eval(`(async () => { const s = window.__idleRpg.store; const sc = window.__idleRpg.scene().camera.scene;
        s.getState().setPref({ visuals: { animations: 'on' } });
        const g0 = s.getState().game; s.setState({ game: { ...g0, movement: { ...g0.movement, position: { x: 13, y: 11 }, path: [] } } });
        const on = sc.buildings.state('willowbrook_bank');
        s.getState().setPref({ visuals: { animations: 'off' } });
        const g1 = s.getState().game; s.setState({ game: { ...g1, movement: { ...g1.movement, position: { x: 13, y: 16 }, path: [] } } });
        const outOff = sc.buildings.state('willowbrook_bank');
        const g2 = s.getState().game; s.setState({ game: { ...g2, movement: { ...g2.movement, position: { x: 13, y: 11 }, path: [] } } });
        const inOff = sc.buildings.state('willowbrook_bank');
        s.getState().setPref({ visuals: { animations: 'on' } });
        return { on, outOff, inOff }; })()`);
      expect(mid.on.roofAlpha > 0, 'On should still be fading: ' + JSON.stringify(mid.on));
      expect(
        mid.outOff.roofAlpha === 1 && mid.outOff.frontWallAlpha === 1,
        JSON.stringify(mid.outOff),
      );
      expect(
        mid.inOff.roofAlpha === 0 && close(mid.inOff.frontWallAlpha, 0.2),
        JSON.stringify(mid.inOff),
      );
      return JSON.stringify(mid);
    });

    await check('bank-inside', 'tap booth from inside opens the bank', async () => {
      await g.teleport(12, 11);
      await g.sleep(300);
      await g.tapObject('bank_booth_1');
      await g.waitFor(async () => (await g.state('bankOpen')) === true, {
        timeoutMs: 15000,
        label: 'bank open',
      });
      await g.screenshot(`${vp}-bank-open`);
      return `bankOpen true, pos ${JSON.stringify(await pos(g))}`;
    });

    await check(
      'banner',
      'area banner vs NPC nameplates when entering (P3 if overlap)',
      async () => {
        await g.update(`({ ...g, bankOpen: false })`);
        await g.teleport(16, 17, { settleMs: 1500 });
        await g.walkTo(13, 14); // store shortcut for travel only
        await g.waitFor(async () => (await pos(g)).y === 14, { timeoutMs: 15000, label: 'door' });
        await g.sleep(1500);
        await walkTo(g, 13, 11);
        const r =
          await g.eval(`(() => { const t = document.querySelector('.area-banner-title'); if (!t) return { banner: null };
        const br = t.getBoundingClientRect(); const sc = window.__idleRpg.scene().camera.scene; const cam = sc.cameras.main; const cv = sc.game.canvas.getBoundingClientRect();
        const plates = []; const walk = (l) => l.forEach((o) => { if (o.type === 'Container') walk(o.list); else if (o.type === 'Text' && o.text && o.visible) { const b = o.getBounds(); const v = cam.worldView;
          const px = cv.left + ((b.x - v.x) / v.width) * cv.width * 1; const py = cv.top + ((b.y - v.y) / v.height) * cv.height; plates.push({ text: o.text, l: px, t: py, r: px + (b.width / v.width) * cv.width, b: py + (b.height / v.height) * cv.height }); } });
        walk(sc.children.list);
        const hit = plates.filter((p) => p.l < br.right && p.r > br.left && p.t < br.bottom && p.b > br.top);
        return { banner: { text: t.textContent, l: br.left, t: br.top, r: br.right, b: br.bottom }, plates, hit: hit.map((h) => h.text) }; })()`);
        await g.screenshot(`${vp}-banner`);
        console.log('     BANNER ' + JSON.stringify(r));
        return `banner=${r.banner ? r.banner.text : 'none shown'} overlaps=${JSON.stringify(r.hit ?? [])}`;
      },
    );
  }),
);
process.exit(0);
