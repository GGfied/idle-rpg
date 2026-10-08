// QA slice: Willowbrook Bank building, booths, Bankers and the banker dialogue, driven with real pointer/touch input
// (desktop mouse + right-click, phone touch + long-press). FAST BASE: desktop and phone run as parallel children,
// ?tickMs=30, waits on state. Run: node tests/e2e/bank.e2e.mjs (base port 7701; E2E_PORT overrides)
import {
  BANKERS,
  BOOTHS,
  bankOps,
  choices,
  clickBtn,
  closeAll,
  dialogueText,
  dist,
  dom,
  exists,
  key,
  menuLabels,
  snap,
  timed,
  waitBank,
  waitChoices,
  waitDialogue,
  waitMenu,
  walkSettled,
} from './bankKit.mjs';
import { expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 7701;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
const SAVE = 'idle-rpg:save:1';

// Scene text objects that are visible (nameplates).
const TEXTS = `(() => { const out = []; const walk = (l) => l.forEach((o) => { if (o.type === 'Container') walk(o.list); else if (o.type === 'Text' && o.visible) out.push(o.text); });
  walk(window.__idleRpg.scene().camera.scene.children.list); return out; })()`;

await withGame(
  // tickMs 30 = the DEV hook's fastest tick (20x)
  { port: PORT, budgetMs: BUDGET_MS, tickMs: 30 },
  forEachCombo(COMBOS, async (g, vp) => {
    // the follow camera eases after a walk: settle first so the tap point is the final one
    const tapTile = async (t, dy = 0) => {
      await g.settle();
      return g.tapTile(t.x, t.y, dy);
    };
    // The minimap dot check counts exact-colour pixels, which needs the original desktop dpr (1.6; lib's desktop is 1).
    if (vp === 'desktop')
      await g.cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1.6,
        mobile: false,
      });
    await g.teleportSettled(13, 15);

    await timed(
      'render',
      'bank building renders, Banker nameplates, door gap passable',
      async () => {
        await g.screenshot(`${vp}-outside`);
        const texts = await g.eval(TEXTS);
        const n = texts.filter((t) => t === 'Banker').length;
        expect(n === 2, `expected 2 "Banker" nameplates, got ${n}; texts=${JSON.stringify(texts)}`);
        return '2 Banker nameplates';
      },
    );

    await timed(
      'door',
      'walk in through the door gap (13,14) with a real tap on the floor inside',
      async () => {
        await tapTile({ x: 13, y: 12 });
        await g.waitIdle();
        const s = await snap(g);
        expect(
          s.pos.x === 13 && s.pos.y === 12,
          `player at ${JSON.stringify(s.pos)}, wanted (13,12)`,
        );
        await g.screenshot(`${vp}-inside`);
        return 'now (13,12) after passing door (13,14)';
      },
    );

    await timed('minimap', 'minimap shows yellow NPC dots', async () => {
      const n = await dom(
        g,
        `const c=document.querySelector('.minimap'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4){ if(Math.abs(d[i]-255)<8&&Math.abs(d[i+1]-225)<8&&Math.abs(d[i+2]-53)<8&&d[i+3]>200) n++;} return n;`,
      );
      expect(n >= 4, `only ${n} yellow pixels`); // one 3 px NPC dot is ~6-10 px after anti-aliasing at dpr >= 1.6
      return `${n} yellow pixels`;
    });

    await timed(
      'booth-menu',
      'long-press / right-click a booth: Bank + Examine + Cancel',
      async () => {
        await g.settle();
        const pt = await g.tileClient(BOOTHS[0].x, BOOTHS[0].y);
        await g.longPress(pt.x, pt.y);
        await waitMenu(g);
        const labels = await menuLabels(g);
        expect(
          labels.some((l) => /^Bank/.test(l)) &&
            labels.some((l) => /^Examine/.test(l)) &&
            labels.some((l) => /^Cancel/.test(l)),
          `menu: ${JSON.stringify(labels)}`,
        );
        await clickBtn(g, '[role=menuitem]', '^Cancel');
        await g.waitFor(async () => !(await exists(g, '[role=menu]')), { label: 'menu closed' });
        expect(!(await snap(g)).bankOpen, 'bank opened by Cancel');
        return JSON.stringify(labels);
      },
    );

    await timed('booth-tap', 'tap booth 1: walks adjacent, opens bank', async () => {
      await walkSettled(g, 13, 12);
      await tapTile(BOOTHS[0]);
      await waitBank(g);
      const s = await snap(g);
      await g.screenshot(`${vp}-bank-open`);
      expect(dist(s.pos, BOOTHS[0]) <= 2, `player ${JSON.stringify(s.pos)} not near booth`);
      return `player ${JSON.stringify(s.pos)}, booth (12,9)`;
    });

    // check() closes overlays first, so each check opens what it needs by itself
    await timed('bank-ops', 'deposit inventory / withdraw 1 / withdraw all counts', async () => {
      await walkSettled(g, 13, 12);
      await tapTile(BOOTHS[0]);
      await waitBank(g);
      return bankOps(g);
    });

    await timed('walk-away', 'walking away closes the bank', async () => {
      // the overlay may cover the canvas on phone; close-by-walking is a ground tap, so tap a visible tile if any
      await clickBtn(g, '.bank-overlay button', 'Close');
      await waitBank(g, false);
      await walkSettled(g, 13, 12);
      await tapTile(BOOTHS[0]);
      await waitBank(g);
      const pt = await g.tileClient(13, 12);
      const topCanvas = await g.page(`topIsCanvas(${pt.x}, ${pt.y})`);
      if (topCanvas) await g.tap(pt.x, pt.y);
      else await g.walkTo(13, 13); // overlay covers the canvas: user-equivalent movement instead
      await g.waitIdle();
      await waitBank(g, false, 3000).catch(() => undefined);
      const s = await snap(g);
      const note = topCanvas ? 'ground tap' : 'walkTo shortcut (overlay covers canvas)';
      expect(
        !s.bankOpen,
        `bank still open after walking away (${note}); pos ${JSON.stringify(s.pos)}`,
      );
      return `closed via ${note}`;
    });

    await timed('counter', 'cannot walk behind the counter (alcoves and booth tiles)', async () => {
      // Behind the counter = the alcove row y=8 inside the building (x 9..17) or a booth tile. y<9 OUTSIDE (north of the
      // wall) is fine: tapping the wall tile (12,7) legitimately walks round to (12,6). Every visited tile is tracked.
      const behind = (p) =>
        (p.y === 8 && p.x >= 9 && p.x <= 17) || BOOTHS.some((b) => b.x === p.x && b.y === p.y);
      const bad = [];
      await walkSettled(g, 13, 12);
      const stop = await g.trackMoves();
      for (const t of [...BANKERS, ...BOOTHS, { x: 13, y: 8 }, { x: 13, y: 9 }]) {
        await walkSettled(g, 13, 12);
        await g.walkTo(t.x, t.y);
        await g.waitIdle({ timeoutMs: 20000 });
        await g.sleep(120); // a few 30 ms ticks: a wrongly accepted path would already show
        const s = await snap(g);
        if (behind(s.pos)) bad.push(`(${t.x},${t.y}) -> ${JSON.stringify(s.pos)}`);
      }
      // real tap on the banker's alcove tile is a Talk-to, so tap the wall tile behind (12,7) instead
      await walkSettled(g, 13, 12);
      await tapTile({ x: 12, y: 7 });
      await g.sleep(150);
      await g.waitIdle({ timeoutMs: 20000 });
      await g.sleep(120);
      const visited = await stop();
      for (const p of visited) if (behind(p)) bad.push(`visited (${p.x},${p.y})`);
      expect(bad.length === 0, `reached behind counter: ${bad.join('; ')}`);
      const end = (await snap(g)).pos;
      await closeAll(g);
      return `never on y=8 alcoves or booths over ${visited.length} tiles; tap (12,7) ended ${end.x},${end.y}`;
    });

    await timed(
      'talk',
      'Talk-to banker (tap) walks within reach and opens the dialogue',
      async () => {
        await walkSettled(g, 16, 12);
        await closeAll(g);
        await tapTile(BANKERS[0], -20);
        await waitDialogue(g);
        const s = await snap(g);
        await g.screenshot(`${vp}-dialogue`);
        const txt = await dialogueText(g);
        expect(/Good day! Welcome to Willowbrook Bank/.test(txt ?? ''), `text: ${txt}`);
        expect(
          dist(s.pos, BANKERS[0]) <= 2,
          `player ${JSON.stringify(s.pos)} not within reach of banker`,
        );
        return `player ${JSON.stringify(s.pos)}; "${txt}"`;
      },
    );

    // The line types out: the first click only completes it, the next one advances. Click until the choices show.
    const advance = async () => {
      for (let i = 0; i < 8 && (await choices(g)).length === 0; i++) {
        await dom(g, `document.querySelector('.dialogue-main')?.click();`);
        await g.sleep(120);
      }
    };

    await timed(
      'flow',
      'Enter / tap continue; choice 2 answers and returns; choice 1 opens bank',
      async () => {
        await tapTile(BANKERS[0], -20);
        await waitDialogue(g);
        await key(g, 'Enter', 'Enter', 13);
        await waitChoices(g);
        const c = await choices(g);
        expect(
          c[0] === "I'd like to access my bank." &&
            c[1] === 'What is this place?' &&
            c[2] === 'Nothing, thanks.',
          `choices ${JSON.stringify(c)}`,
        );
        await clickBtn(g, '.dialogue-choice', 'What is this place');
        await g.waitFor(async () => /keep your things safe/.test((await dialogueText(g)) ?? ''), {
          label: 'about text',
        });
        await advance();
        await waitChoices(g);
        await clickBtn(g, '.dialogue-choice', 'access my bank');
        await waitBank(g, true, 5000);
        expect(!(await exists(g, '.dialogue')), 'dialogue still open after opening bank');
        await clickBtn(g, '.bank-overlay button', 'Close');
        return 'greeting -> Enter -> choices ok; about -> tap -> back; choice 1 opened bank, dialogue closed';
      },
    );

    await timed(
      'close-nothing',
      '"Nothing, thanks" closes; Escape closes; ground click closes',
      async () => {
        const open = async () => {
          await tapTile(BANKERS[0], -20);
          await waitDialogue(g);
          await advance();
          await waitChoices(g);
        };
        const closed = (what) =>
          g.waitFor(async () => !(await exists(g, '.dialogue')), { timeoutMs: 3000, label: what });
        await open();
        await clickBtn(g, '.dialogue-choice', 'Nothing, thanks');
        await closed('"Nothing, thanks" did not close');
        await open();
        await key(g, 'Escape', 'Escape', 27);
        await closed('Escape did not close');
        await open();
        await g.settle();
        const pt = await g.tileClient(16, 12);
        const topCanvas = await g.page(`topIsCanvas(${pt.x}, ${pt.y})`);
        let note = 'ground tap';
        if (topCanvas) await g.tap(pt.x, pt.y);
        else {
          // find any canvas-visible tile (the dialogue box covers part of the screen on phones)
          let found = null;
          for (let ty = 8; ty <= 14 && !found; ty++)
            for (let tx = 10; tx <= 16 && !found; tx++) {
              const q = await g.tileClient(tx, ty);
              if (q.x > 0 && q.y > 0 && (await g.page(`topIsCanvas(${q.x}, ${q.y})`)))
                found = { q, tx, ty };
            }
          expect(found, 'no visible ground tile to tap while the dialogue is open');
          note = `ground tap at (${found.tx},${found.ty})`;
          await g.tap(found.q.x, found.q.y);
        }
        await closed(`dialogue stayed open after ${note}`);
        return `all three closed it (${note})`;
      },
    );

    await timed(
      'banker2',
      'second Banker (booth 2) opens the dialogue and booth 2 opens bank',
      async () => {
        await g.waitIdle();
        await walkSettled(g, 14, 12);
        await tapTile(BANKERS[1], -20);
        await waitDialogue(g);
        await key(g, 'Escape', 'Escape', 27);
        await g.waitFor(async () => !(await exists(g, '.dialogue')), { label: 'dialogue closed' });
        await tapTile(BOOTHS[1]);
        await waitBank(g);
        await clickBtn(g, '.bank-overlay button', 'Close');
        return 'ok';
      },
    );

    await timed('persist', 'bank contents persist across reload', async () => {
      await closeAll(g);
      const before = await snap(g);
      expect(before.bank.length > 0, 'bank empty before reload; nothing to verify');
      // the progress save is debounced: wait until the stored save really holds the banked logs
      const logs = before.bank.find((b) => b.itemId === 'logs');
      await g.waitFor(
        () =>
          g.eval(`(() => { const raw = localStorage.getItem(${JSON.stringify(SAVE)}); if (!raw) return false;
            const has = (o) => o && typeof o === 'object' && ((o.itemId === 'logs' && o.quantity === ${logs.quantity}) || Object.values(o).some(has));
            return has(JSON.parse(raw)); })()`),
        { timeoutMs: 8000, label: 'save holds the banked logs' },
      );
      await g.cdp.send('Page.reload'); // keeps localStorage (g.load() would clear it)
      await g.waitFor(() => g.page('ready()').catch(() => false), {
        timeoutMs: 25000,
        label: 'reload ready',
      });
      await g.sleep(300);
      const after = await snap(g);
      expect(
        JSON.stringify(after.bank) === JSON.stringify(before.bank),
        `bank ${JSON.stringify(before.bank)} -> ${JSON.stringify(after.bank)}`,
      );
      return JSON.stringify(after.bank);
    });
  }),
);
