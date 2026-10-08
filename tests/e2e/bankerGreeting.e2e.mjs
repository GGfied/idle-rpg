// Banker greeting: dialogue var {place} resolves per NPC (Fernhaven vs Willowbrook). Run: node tests/e2e/bankerGreeting.e2e.mjs
// Fast base: runParallel desktop + phone, withCombos, 60 ms ticks, budget 60 s. webgl only: the greeting/avatar checks
// read the dialogue DOM; the world-hair pixel check counts exact palette colours, which both renderers draw alike, so a
// canvas child adds no coverage here (canvas art is covered by canvasRender/playerLook). Preconditions by teleport:
// the player stands at the old walk-route END tile (inside Fernhaven bank / below the Willowbrook booth) instead of
// tapping a 2-3 hop route in; the banker itself is still opened with a real tap. Camera waits = g.settle(), the
// typewriter loop waits on the dialogue node / data-typing change instead of 400 ms sleeps.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9517; // combos use 9517..9518
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const DLG = `section[aria-label^="Dialogue with"]`;
const TXT = `(document.querySelector('${DLG}')?.textContent ?? '')`;

/** Stand at (x, y) as if the walk route had ended there; the camera is settled before any tap. */
async function arriveAt(g, x, y) {
  await g.teleportSettled(x, y);
  const p = await g.state('movement.position');
  expect(p.x === x && p.y === y, `teleport to ${x},${y} landed at ${p.x},${p.y}`);
}

/** Tap the greeting until the choices show: a tap while typing finishes the line, the next advances the node. */
async function toChoices(g) {
  const stage = () =>
    g.eval(
      `JSON.stringify([window.__e.game().talk?.dialogue.nodeId, document.querySelector('${DLG} .dialogue-continue')?.dataset.typing])`,
    );
  for (let i = 0; i < 4; i++) {
    if (await g.eval(`!!document.querySelector('${DLG} .dialogue-choice')`)) break;
    const s0 = await stage();
    await g.tapSelector('.dialogue-main');
    await g
      .waitFor(async () => (await stage()) !== s0, { timeoutMs: 3000, label: 'dialogue advanced' })
      .catch(() => {});
  }
}

/** Real tap on a banker, then wait for the dialogue box; returns its text. */
async function talkTo(g, spawnId) {
  await g.settle();
  await g.tapObject(spawnId);
  await g.waitFor(async () => (await g.eval(TXT)).includes('Bank'), {
    label: `dialogue text for ${spawnId}`,
    timeoutMs: 15000,
  });
  return g.eval(TXT);
}

// was: teleport 94,71 (outside) + tap route 94,68 -> 94,66 -> tx,ty
const fernhavenEntry = (g, tx, ty) => arriveAt(g, tx, ty);

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  for (const [id, name, tx, ty] of [
    ['banker_3', 'check 1', 93, 63],
    ['banker_4', 'check 2', 95, 63],
  ]) {
    await check(
      id,
      `${name}: Fernhaven ${id} greets with "Fernhaven Bank", no {place}`,
      async () => {
        await fernhavenEntry(g, tx, ty);
        const t = await talkTo(g, id);
        expect(t.includes('Fernhaven Bank'), `text: ${t}`);
        expect(!t.includes('{place}') && !t.includes('Willowbrook'), `text: ${t}`);
        return `${vp}: "${t.slice(0, 80)}"`;
      },
    );
  }
  await check('w1', 'check 3: Willowbrook banker says Willowbrook Bank', async () => {
    await arriveAt(g, 13, 12); // was: teleport 13,17 + tap route 13,15 -> 13,12
    const t = await talkTo(g, 'banker_1');
    expect(t.includes('Willowbrook Bank') && !t.includes('Fernhaven'), `text: ${t}`);
    expect(!t.includes('{place}'), `text: ${t}`);
    return `${vp}: "${t.slice(0, 80)}"`;
  });
  await check('opt', 'check 4: bank option opens the bank; close works', async () => {
    await fernhavenEntry(g, 93, 63);
    await talkTo(g, 'banker_3');
    // The greeting is a say node: tap the dialogue box to advance to the choices
    await toChoices(g);
    await g.waitFor(
      () =>
        g.eval(
          `[...document.querySelectorAll('${DLG} button')].some(b => /access my bank/i.test(b.textContent))`,
        ),
      { label: 'choices visible' },
    );
    await g.eval(
      `(() => { const b = [...document.querySelectorAll('${DLG} button')].find(b => /access my bank/i.test(b.textContent)); b.setAttribute('data-qa','bank-opt'); })()`,
    );
    await g.tapSelector('[data-qa="bank-opt"]');
    await g.waitFor(async () => (await g.state('bankOpen')) === true, { label: 'bank opens' });
    const talkAfter = await g.eval(`!!document.querySelector('${DLG}')`);
    await g.eval(
      `(() => { const b = [...document.querySelectorAll('[role="dialog"][aria-label="Bank"] button')].find((b) => /^close$/i.test(b.textContent.trim())); if (b) b.setAttribute('data-qa', 'bank-close'); })()`,
    );
    await g.tapSelector('[data-qa="bank-close"]');
    await g.waitFor(async () => (await g.state('bankOpen')) === false, { label: 'bank closes' });
    return `${vp}: bank opened then closed; dialogue still open after open=${talkAfter}`;
  });
  // ---- Gendered bankers: world look + avatar show the TALKED banker ----
  const AV = `document.querySelector('${DLG} img.dialogue-avatar-img')?.src ?? ''`;
  const portrait = (look) =>
    g.eval(`import('/src/render/index.ts').then((r) => r.portraitUrl('${look}', 24))`);
  const toWillow = (col = 13) => arriveAt(g, col, 12); // was: teleport col,17 + route col,15 -> col,12
  const closeDlg = async () => {
    await g.eval(`document.querySelector('${DLG} .dialogue-close')?.click()`);
    await g.waitFor(async () => !(await g.eval(`!!document.querySelector('${DLG}')`)), {
      label: 'dialogue closed',
    });
  };
  const avatars = {};
  const HAIR = { banker: [0xa8, 0xa8, 0xb0], banker_f: [0x2a, 0x18, 0x20] };
  await g.eval(`window.__hair = async (b64, box, rgbs) => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const k = bmp.width / innerWidth;
      const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const x0 = Math.max(0, Math.round(box.x * k)), y0 = Math.max(0, Math.round(box.y * k));
      const d = x.getImageData(x0, y0, Math.round(box.w * k), Math.round(box.h * k)).data;
      return rgbs.map((t) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-t[0]) < 4 && Math.abs(d[i+1]-t[1]) < 4 && Math.abs(d[i+2]-t[2]) < 4) n++; return n; });
    }`);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const clipShot = async (name, box, scale = 3) => {
    const dir = process.env.SHOTS_DIR;
    if (!dir) return;
    const { data } = await g.cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.w, height: box.h, scale },
    });
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}-${vp}.png`, Buffer.from(data, 'base64'));
  };
  for (const [id, look, place, fern] of [
    ['banker_1', 'banker', 'Willowbrook', false],
    ['banker_2', 'banker_f', 'Willowbrook', false],
    ['banker_3', 'banker', 'Fernhaven', true],
    ['banker_4', 'banker_f', 'Fernhaven', true],
  ]) {
    await check(
      `av_${id}`,
      `${id}: world look + avatar are ${look}, greeting names ${place}`,
      async () => {
        if (fern) await fernhavenEntry(g, id === 'banker_3' ? 93 : 95, 63);
        else await toWillow(id === 'banker_2' ? 14 : 13);
        const tg = (await g.targets()).find((t) => t.id === id);
        await g.settle();
        const head = await g.tileClient(tg.x, tg.y, -tg.up * 0.8);
        const box = { x: head.x - 14, y: head.y - 16, w: 28, h: 30 };
        const { data: png } = await g.cdp.send('Page.captureScreenshot', { format: 'png' });
        const [male, fem] = await g.eval(
          `window.__hair(${JSON.stringify(png)}, ${JSON.stringify(box)}, ${JSON.stringify([HAIR.banker, HAIR.banker_f])})`,
        );
        await clipShot(`world-${id}`, { x: head.x - 40, y: head.y - 40, w: 80, h: 110 });
        const own = look === 'banker' ? male : fem;
        const other = look === 'banker' ? fem : male;
        const t = await talkTo(g, id);
        const src = await g.eval(AV);
        const want = await portrait(look);
        avatars[id] = src;
        const nb = await g.rect(`${DLG} .dialogue-name`);
        await clipShot(`face-${id}`, { x: nb.left, y: nb.top, w: Math.min(nb.w, 160), h: nb.h }, 4);
        if (id === 'banker_2') await g.screenshot(`banker_f-${vp}`);
        await closeDlg();
        expect(
          own >= 6 && other * 4 < own,
          `world hair px: grey=${male} darkbrown=${fem} (want ${look})`,
        );
        expect(
          want && want.startsWith('data:'),
          `portraitUrl(${look}) = ${String(want).slice(0, 30)}`,
        );
        expect(
          src === want,
          `avatar src ${src.slice(0, 40)}.. (${src.length}) != ${look} (${want.length})`,
        );
        expect(t.includes(place + ' Bank') && (fern || !t.includes('Fernhaven')), `text: ${t}`);
        return `${vp}: ${id} hair grey=${male} dark=${fem}; src len ${src.length} === portraitUrl(${look})`;
      },
    );
  }
  await check('av_diff', 'avatar: male src differs from female src', async () => {
    expect(avatars.banker_1 && avatars.banker_1 !== avatars.banker_2, 'Willowbrook male == female');
    expect(avatars.banker_3 && avatars.banker_3 !== avatars.banker_4, 'Fernhaven male == female');
    return `${vp}: both pairs differ`;
  });
  for (const id of ['banker_2', 'banker_4']) {
    await check(`bank_${id}`, `Bank option from ${id} opens the bank`, async () => {
      if (id === 'banker_4') await fernhavenEntry(g, 95, 63);
      else await toWillow(14);
      await talkTo(g, id);
      await toChoices(g);
      await g.eval(
        `(() => { const b = [...document.querySelectorAll('${DLG} button')].find(b => /access my bank/i.test(b.textContent)); b?.setAttribute('data-qa','bank-opt'); })()`,
      );
      await g.tapSelector('[data-qa="bank-opt"]');
      await g.waitFor(async () => (await g.state('bankOpen')) === true, { label: 'bank opens' });
      return `${vp}: ${id} bank opened`;
    });
  }
});
