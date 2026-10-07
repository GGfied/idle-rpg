// dialogueAvatar: dialogue speaker avatar is a face portrait. Run: node tests/e2e/dialogueAvatar.e2e.mjs (E2E_PORT overrides 5227)
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const info = (g) =>
  g.eval(`(() => { const i = document.querySelector('.dialogue-avatar-img'); const a = document.querySelector('.dialogue-avatar');
    const r = (i ?? a)?.getBoundingClientRect(); const cs = i ? getComputedStyle(i) : null;
    return { hasImg: !!i, tag: (i ?? a)?.tagName, src: i?.src?.slice(0, 22), srcLen: i?.src?.length ?? 0, alt: i?.alt, w: r?.width, h: r?.height, left: r?.left, top: r?.top,
      radius: cs?.borderRadius, nat: i ? [i.naturalWidth, i.naturalHeight] : null, dpr: devicePixelRatio, name: document.querySelector('.dialogue')?.getAttribute('aria-label') }; })()`);
const clipShot = async (g, name) => {
  const b = await g.eval(
    `(() => { const r = document.querySelector('.dialogue').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`,
  );
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: b.x, y: b.y, width: b.w, height: Math.min(b.h, 220), scale: 3 },
  });
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dir = process.env.SHOTS_DIR ?? 'tests/e2e/.shots-avatar';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'));
  return `${dir}/${name}.png`;
};

const open = async (g, banker) => {
  await g.teleport(banker.x + 2, banker.y + 2);
  await g.tapObject(banker.id);
  await g.waitFor(() => g.eval(`!!document.querySelector('.dialogue-text')`), {
    label: 'dialogue',
  });
};
const toChoices = async (g) => {
  for (let i = 0; i < 6 && !(await g.eval(`!!document.querySelector('.dialogue-choice')`)); i++) {
    await g.tapSelector('.dialogue-main');
    await g.sleep(500);
  }
};

await withGame(
  { port: Number(process.env.E2E_PORT ?? 5227) },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    let banker;
    await check('a1', 'banker avatar is img data:image/png, alt = name, round', async () => {
      banker = (await g.targets()).find((t) => t.id.includes('banker') && t.kind === 'npc');
      await g.teleport(banker.x + 2, banker.y + 2);
      await g.tapObject(banker.id);
      await g.waitFor(() => g.eval(`!!document.querySelector('.dialogue-text')`), {
        label: 'dialogue',
      });
      const a = await info(g);
      const shot = await clipShot(g, `banker-${vp}`);
      expect(a.hasImg && a.src?.startsWith('data:image/png'), () => JSON.stringify(a));
      expect(
        a.alt && a.alt !== 'You' && a.name?.includes(a.alt),
        () => `alt ${a.alt} label ${a.name}`,
      );
      expect(a.w === 24 && a.h === 24 && /50%|12px/.test(a.radius), () => JSON.stringify(a));
      return `${vp}: ${JSON.stringify(a)} ${shot}`;
    });
    await check('a2', 'player speaking shows a different portrait, alt You', async () => {
      await open(g, banker);
      const a0 = await g.eval(`document.querySelector('.dialogue-avatar-img')?.src`);
      await toChoices(g);
      const a = await info(g);
      const shot = await clipShot(g, `player-${vp}`);
      expect(a.hasImg && a.src?.startsWith('data:image/png') && a.alt === 'You', () =>
        JSON.stringify(a),
      );
      const a1 = await g.eval(`document.querySelector('.dialogue-avatar-img')?.src`);
      expect(a1 !== a0, 'player portrait identical to banker portrait');
      return `${vp}: alt ${a.alt} natural ${a.nat} css ${a.w}x${a.h} dpr ${a.dpr} ${shot}`;
    });
    await check('a3', 'layout: choices/close >=44px, sheet clear of orbs/minimap', async () => {
      await open(g, banker);
      await toChoices(g);
      const r =
        await g.eval(`(() => { const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        return { hs: [...document.querySelectorAll('.dialogue-choice')].map((e) => e.getBoundingClientRect().height), close: b('.dialogue-close'), d: b('.dialogue'), orbs: b('.orbs'), mm: b('.minimap-wrap') }; })()`);
      const ov = (a, b) => a && b && b.w > 0 && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      expect(r.hs.length === 3 && r.hs.every((h) => h >= 44), () => `choices ${r.hs}`);
      expect(r.close.w >= 44 && r.close.h >= 44, () => `close ${r.close.w}x${r.close.h}`);
      expect(!ov(r.d, r.orbs) && !ov(r.d, r.mm), () => `overlap ${JSON.stringify(r)}`);
      return `${vp}: choices ${r.hs.map(Math.round)} close ${r.close.w}x${r.close.h} dialogue ${Math.round(r.d.t)}-${Math.round(r.d.b)}`;
    });
  }),
);
