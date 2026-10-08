// Mining e2e (runbook mining-fishing task 8): starter pickaxe, quarry area, mine copper, level gate, full inv, menu, block, bank.
// Run: node tests/e2e/mining.e2e.mjs   (port 9009 +1 per combo, E2E_PORT overrides; SHOTS_DIR defaults to tests/e2e/.shots-mining)
// Fast base: desktop + phone as parallel children, ?tickMs=60, wait-on-state (no fixed sleeps), budget 60 s.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR ?? resolve(HERE, '.shots-mining');
const fixture = readFileSync(
  resolve(HERE, '../../src/core/persistence/fixtures/save-v1.json'),
  'utf8',
);
const SAVE = 'idle-rpg:save:1';
const PORT = 9009;
const BUDGET_MS = 60e3;
const port = Number(process.env.E2E_PORT ?? PORT);
const J = JSON.stringify;
const SPY = `(() => { if (window.__mm) return; const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { frame: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') window.__mm.frame = []; return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') window.__mm.frame.push(t); return of.call(this, t, x, y); }; })();`;
const SND_SPY = `(() => { window.__snd = []; const P = window.AudioContext.prototype; if (P.__spied) return; P.__spied = true; const orig = P.createOscillator;
  P.createOscillator = function () { const o = orig.call(this); const f = o.frequency, sv = f.setValueAtTime.bind(f); let first = true;
    f.setValueAtTime = (v, t) => { if (first) { first = false; window.__snd.push({ at: performance.now(), wave: o.type, f: v }); } return sv(v, t); };
    return o; }; })();`;

// Not realTime: 120 ms ticks keep the same tick order and sound path as 600 ms (pickHit minGap 150 < swing gap)
// and a session survives (at 60 ms it ends in ~1 s); ores/respawns take a fifth of the wall time.
const FAST_TICK = 120;
const realish = async (g, fn) => {
  await g.setTickMs(FAST_TICK);
  try {
    return await fn();
  } finally {
    await g.setTickMs(60);
  }
};
const R = {
  copper: { id: 'quarry_copper_1', x: 73, y: 41 },
  iron: { id: 'quarry_iron_1', x: 77, y: 45 },
};
const count = (g, id) =>
  g.eval(
    `window.__e.game().inventory.slots.reduce((n, s) => n + (s && s.itemId === ${J(id)} ? s.quantity : 0), 0)`,
  );
const miningXp = (g) => g.eval('window.__e.game().progression.xp.mining ?? 0');
const node = (g, id) =>
  g.eval(`JSON.stringify(window.__e.game().gathering.nodes[${J(id)}] ?? null)`);
const art = (g, id) =>
  g.eval(`window.__idleRpg.scene().camera.scene.nodes.get(${J(id)}).art.texture.key`);
const rockPt = (g, r, dy = -12) => g.tileClient(r.x, r.y, dy);
const tapRock = async (g, r) => {
  const p = await rockPt(g, r);
  expect(
    await g.page(`topIsCanvas(${p.x}, ${p.y})`),
    `${r.id} covered by HUD at ${Math.round(p.x)},${Math.round(p.y)}`,
  );
  await g.tap(p.x, p.y);
};
async function shot(g, name, r) {
  await g.settle();
  const p = await rockPt(g, r, -10);
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 70), width: 120, height: 110, scale: 4 },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.viewportName}-${name}.png`), Buffer.from(data, 'base64'));
}
const logOf = (g) => g.chatLines();

const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const ready = (g) =>
  g.waitFor(() => g.page('ready()').catch(() => false), { timeoutMs: 25000, label: 'ready' });
// Wait for the real respawn (6 ticks = 0.7 s at 120 ms; the node art is event-driven, so a store edit can't fake it).
const respawn = (g, r, a0) =>
  g.waitFor(async () => (await art(g, r.id)) === a0, { timeoutMs: 15000, label: 'respawn art' });

await withGame(
  { port, budgetMs: BUDGET_MS, initScripts: [SPY, SND_SPY] },
  forEachCombo(COMBOS, async (g, vp) => {
    g.viewportName = vp;

    await check('m1', 'fresh game has 1 bronze_pickaxe', async () => {
      const n = await count(g, 'bronze_pickaxe');
      expect(n === 1, `pickaxes ${n}`);
      return `pickaxe ${n}, axe ${await count(g, 'bronze_axe')}`;
    });

    await check('m3', 'walk into Stonefold Quarry: banner + minimap label', async () => {
      await g.teleport(67, 44, { settleMs: 0 });
      await g.waitTicks(2); // the area tracker sees the outside tile first
      await g.teleport(70, 43, { settleMs: 0 }); // crossing into the area
      let banner = '';
      await g
        .waitFor(
          async () =>
            (banner = await g.eval(
              `document.querySelector('.area-banner-inner')?.textContent ?? ''`,
            )).includes('Stonefold Quarry'),
          { timeoutMs: 6000, label: 'banner' },
        )
        .catch(() => {});
      let frame = '';
      await g
        .waitFor(
          async () =>
            (frame = await g.eval('JSON.stringify(window.__mm.frame)')).includes(
              'Stonefold Quarry',
            ),
          { timeoutMs: 6000, label: 'minimap label' },
        )
        .catch(() => {});
      expect(banner.includes('Stonefold Quarry'), `banner "${banner}"`);
      expect(frame.includes('Stonefold Quarry'), `minimap labels ${frame}`);
      return `banner "${banner}"; minimap has label`;
    });

    await check('m4', 'tap copper: chat, ore, +17.5 XP, rubble art, respawn', async () => {
      await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
      await g.teleportSettled(R.copper.x, R.copper.y + 3);
      const xp0 = await miningXp(g);
      const a0 = await art(g, R.copper.id);
      await shot(g, 'copper-full', R.copper);
      let rubble = null,
        a1 = null;
      await realish(g, async () => {
        await tapRock(g, R.copper);
        await g.waitFor(
          async () =>
            (await node(g, R.copper.id)) !== 'null' &&
            JSON.parse(await node(g, R.copper.id)).respawnAt !== null,
          { timeoutMs: 40000, label: 'rock depleted' },
        );
        await g
          .waitFor(async () => (a1 = await art(g, R.copper.id)) !== a0, {
            timeoutMs: 5000,
            label: 'rubble art',
          })
          .catch(() => {});
        await shot(g, 'copper-rubble', R.copper);
        rubble = a1;
      });
      const pos = await g.state('movement.position');
      const adj = Math.max(Math.abs(pos.x - R.copper.x), Math.abs(pos.y - R.copper.y));
      const lines = await logOf(g);
      expect(
        lines.includes('You swing your pickaxe at the rock.'),
        `no swing line: ${J(lines.slice(-6))}`,
      );
      expect(lines.includes('You mine some copper ore.'), `no ore line: ${J(lines.slice(-6))}`);
      const ore = await count(g, 'copper_ore');
      const dxp = (await miningXp(g)) - xp0;
      expect(ore === 1, `copper_ore ${ore}`);
      expect(dxp === 17.5, `xp delta ${dxp}`);
      expect(adj <= 1, `player ${J(pos)} not adjacent`);
      expect(a1 !== a0, `art unchanged ${a0}`);
      await g.waitFor(async () => (await art(g, R.copper.id)) === a0, {
        timeoutMs: 15000,
        label: 'respawn art',
      });
      return `ore 1, xp +${dxp}, adj ${adj}, art ${a0} -> ${rubble} -> ${a0}`;
    });

    await check(
      'm10',
      '120 ms ticks: every ore is announced by a swing line (5 ores; loop shared with m11)',
      async () => {
        await g.setXp('mining', 14000); // high level: ~every swing mines, so the check is about line/sound order, not RNG
        await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
        await g.teleportSettled(R.copper.x, R.copper.y + 3);
        const a0 = await art(g, R.copper.id);
        const miss = [];
        // Shared with m11: record swing/mine chat lines (+ pickHit oscillators via SND_SPY) for the same 5 ores.
        await g.update('({ ...g, chat: [] })');
        await g.eval(`(() => { window.__snd.length = 0; window.__ev = []; let sw = 0, mi = 0;
          window.__idleRpg.store.subscribe((st) => { const c = st.game.chat; const a = c.filter((l) => l.text === 'You swing your pickaxe at the rock.').length, b = c.filter((l) => l.text === 'You mine some copper ore.').length;
            const t = Math.round(performance.now()); for (; sw < a; sw++) window.__ev.push(['swing', t]); for (; mi < b; mi++) window.__ev.push(['mine', t]); }); })()`);
        await realish(g, async () => {
          for (let i = 0; i < 5; i++) {
            const n0 = await count(g, 'copper_ore');
            await tapRock(g, R.copper);
            await g
              .waitFor(async () => (await count(g, 'copper_ore')) === n0 + 1, {
                timeoutMs: 30000,
                label: 'ore ' + i,
              })
              .catch(async (e) => {
                const st = await g.eval(
                  'JSON.stringify({ s: window.__e.game().gathering.session, p: window.__e.game().movement.position, pend: window.__e.game().pendingInteraction, chat: window.__e.game().chat.slice(-4).map((c) => c.text) })',
                );
                throw new Error(e.message + ' state ' + st);
              });
            const lines = await logOf(g);
            const mineAt = lines.lastIndexOf('You mine some copper ore.');
            const swung = lines
              .slice(Math.max(0, mineAt - 3), mineAt)
              .includes('You swing your pickaxe at the rock.');
            if (!swung) miss.push(i);
            await respawn(g, R.copper, a0);
          }
        });
        expect(
          miss.length === 0,
          `ore without a preceding swing line: ${miss.length}/5 (iterations ${J(miss)})`,
        );
        return '5/5 ores had a swing line first';
      },
    );

    await check(
      'm11',
      '120 ms ticks: exactly ONE swing line + ONE pickHit per attempt (none doubled), hit tick has its swing',
      async () => {
        // The ore loop ran once in m10 (5 ores, same 120 ms session); this check reads its recorded events.
        const N = 5;
        expect(await g.eval('Array.isArray(window.__ev)'), 'm10 ore loop did not run');
        // the last pickHit oscillator may land just after its chat line: wait for it (bounded), then assert
        await g
          .waitFor(
            async () => {
              const ev = await g.eval('window.__ev');
              const snd = await g.eval('window.__snd');
              return ev
                .filter((e) => e[0] === 'swing')
                .every(([, t]) => snd.some((x) => Math.abs(x.at - t) <= 150));
            },
            { timeoutMs: 1500, label: 'sounds flushed' },
          )
          .catch(() => {});
        const ev = await g.eval('window.__ev');
        const allSnd = await g.eval('window.__snd');
        const snd0 = allSnd
          .filter(
            (x) => (x.wave === 'triangle' || x.wave === 'square') && x.f >= 1300 && x.f <= 2800,
          )
          .map((x) => x.at);
        const snd = snd0;
        const swings = ev.filter((e) => e[0] === 'swing').map((e) => e[1]);
        const mines = ev.filter((e) => e[0] === 'mine').map((e) => e[1]);
        expect(mines.length === N, `mine lines ${mines.length}`);
        const near = (arr, t, w) => arr.filter((x) => Math.abs(x - t) <= w).length;
        const perMine = mines.map((t) => near(swings, t, 200));
        expect(
          perMine.every((n) => n === 1),
          `swings at each ore tick ${J(perMine)}; swings ${J(swings)} mines ${J(mines)}`,
        );
        const gaps = swings.slice(1).map((t, i) => t - swings[i]);
        expect(
          gaps.every((d) => d >= (450 * FAST_TICK) / 600),
          `swing gaps ${J(gaps)} (a double is < 3/4 tick)`,
        );
        const rawX = allSnd
          .filter(
            (x) =>
              (x.wave === 'triangle' || x.wave === 'square') &&
              !swings.some((t) => Math.abs(t - x.at) <= 150),
          )
          .map((x) => [x.wave, Math.round(x.f), Math.round(x.at)]);
        const perSnd = swings.map((t) => near(snd, t, 150));
        expect(
          perSnd.every((n) => n === 1),
          `pickHit per swing ${J(perSnd)} snd ${J(snd)} swings ${J(swings)}`,
        );
        // Stray tri/square oscillators far from any swing line are ambience, not pickHits (seen once on desktop).
        const wide = snd.filter((t) => near(swings, t, 250) > 0).length;
        expect(
          wide === swings.length,
          `pickHits near swings ${wide} vs swing lines ${swings.length}; far ${J(rawX)}`,
        );
        return `${N} ores, ${swings.length} swings (incl. misses), ${snd.length} pickHits, per-ore ${J(perMine)}`;
      },
    );

    await check('m5', 'iron at level 1: level line, nothing happens', async () => {
      await g.setXp('mining', 175);
      await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
      await g.teleportSettled(R.iron.x, R.iron.y - 3 + 0);
      const xp0 = await miningXp(g),
        a0 = await art(g, R.iron.id);
      await shot(g, 'iron-full', R.iron);
      await tapRock(g, R.iron);
      await g.waitFor(async () => (await logOf(g)).some((l) => /Mining level of 15/.test(l)), {
        timeoutMs: 10000,
        label: 'level line',
      });
      await g.waitTicks(10); // negative check: give the game 10 ticks to (wrongly) start mining
      const ore = await count(g, 'iron_ore');
      expect(ore === 0 && (await miningXp(g)) === xp0, 'ore/xp changed');
      expect((await g.state('gathering.session')) === null, 'session started');
      expect((await art(g, R.iron.id)) === a0, 'art changed');
      return `line ok, iron_ore 0, xp ${xp0} unchanged`;
    });

    await check('m6', 'inventory full: stop line, no ore', async () => {
      await g.setInventory(['bronze_pickaxe', ...Array.from({ length: 27 }, () => 'logs')]);
      await g.teleportSettled(R.copper.x, R.copper.y + 3);
      await tapRock(g, R.copper);
      await g.waitFor(
        async () =>
          (await logOf(g)).some((l) => l === 'Your inventory is too full to hold any more ore.'),
        { timeoutMs: 15000, label: 'full line' },
      );
      expect((await count(g, 'copper_ore')) === 0, 'ore appeared');
      expect((await g.state('gathering.session')) === null, 'session still running');
      return 'stop line shown, 0 ore, session null';
    });

    await check('m7', 'long-press menu: Mine / Examine', async () => {
      await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
      await g.teleportSettled(R.copper.x, R.copper.y + 3);
      const p = await rockPt(g, R.copper);
      await g.longPress(p.x, p.y);
      await g.waitFor(async () => await g.rect('[role=menu]'), { timeoutMs: 4000, label: 'menu' });
      const items = JSON.parse(
        await g.eval(
          `JSON.stringify([...document.querySelectorAll('[role=menu] [role=menuitem], [role=menu] .menu-item')].map((e) => e.textContent.trim()))`,
        ),
      );
      expect(
        items.some((t) => /^Mine/.test(t)) && items.some((t) => /^Examine/.test(t)),
        `menu ${J(items)}`,
      );
      return `menu ${J(items)}`;
    });

    await check('m8', 'rocks block movement', async () => {
      const blocked = await g.eval(
        `import('/src/features/world/index.ts').then((w) => { const c = w.createWorldCollisionGrid(); return JSON.stringify([c.isWalkable(${R.copper.x}, ${R.copper.y}), c.isWalkable(${R.iron.x}, ${R.iron.y})]); })`,
      );
      expect(blocked === '[false,false]', `walkable ${blocked}`);
      await g.teleport(R.copper.x, R.copper.y + 2, { settleMs: 0 });
      const stop = await g.trackMoves();
      await g.walkTo(R.copper.x, R.copper.y);
      await g.waitTicks(10); // the old 600 ms wall wait was 10 ticks at 60 ms
      await g.waitIdle();
      const track = await stop();
      expect(
        !track.some((s) => s.x === R.copper.x && s.y === R.copper.y),
        `entered rock: ${J(track)}`,
      );
      return `isWalkable ${blocked}; walkTo rock never entered (${track.length} steps)`;
    });

    await check('m9', 'bank the ore at the Greatmere booth', async () => {
      await g.setInventory([
        'bronze_axe',
        'bronze_pickaxe',
        { itemId: 'copper_ore', quantity: 1 },
        'copper_ore',
        'tin_ore',
      ]);
      await g.teleportSettled(72, 55);
      await g.tapObject('bank_booth_5');
      await g.waitFor(() => g.state('bankOpen'), { timeoutMs: 15000, label: 'bank open' });
      await g.eval(
        `[...document.querySelectorAll('.bank-overlay button')].find((b) => /Deposit inventory/.test(b.textContent)).click()`,
      );
      await g
        .waitFor(async () => (await count(g, 'copper_ore')) === 0, {
          timeoutMs: 5000,
          label: 'deposit',
        })
        .catch(() => {});
      const bank = await g.eval('JSON.stringify(window.__e.game().bank.items)');
      expect(
        (await count(g, 'copper_ore')) === 0 && /copper_ore/.test(bank) && /tin_ore/.test(bank),
        `bank ${bank}`,
      );
      return `inv ore 0; bank ${bank}`;
    });
    // m2 runs last: it leaves an old-save game loaded (saves a fresh load).
    await check('m2', 'old save (no pickaxe) gets one once; reload keeps exactly 1', async () => {
      const { cdp } = g;
      const url = `http://127.0.0.1:${port}/?tickMs=60`;
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await g.waitFor(async () => (await g.eval('location.href')) === 'about:blank', {
        label: 'blank',
      });
      await cdp.send('Storage.clearDataForOrigin', {
        origin: url.split('/?')[0],
        storageTypes: 'local_storage',
      });
      const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem(${J(SAVE)}, ${J(fixture)});`,
      });
      await cdp.send('Page.navigate', { url });
      await ready(g);
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      const raw = JSON.parse(await g.eval(`localStorage.getItem(${J(SAVE)})`));
      const had = JSON.stringify(raw).includes('pickaxe');
      const n1 = await count(g, 'bronze_pickaxe');
      expect(!had && n1 === 1, `fixture had pickaxe ${had}; after load ${n1}`);
      await g.setXp('woodcutting', 1156); // forces a progress save
      await g.waitFor(
        async () => {
          const v = await g.eval(`localStorage.getItem(${J(SAVE)}) ?? ''`);
          return v.includes('1156') && v.includes('bronze_pickaxe');
        },
        { timeoutMs: 10000, label: 'progress save written' },
      );
      await cdp.send('Page.navigate', { url });
      await ready(g);
      const n2 = await count(g, 'bronze_pickaxe');
      expect(n2 === 1, `after reload pickaxes ${n2}`);
      return `fixture none -> ${n1} -> reload ${n2}; logs ${await count(g, 'logs')}`;
    });
  }),
);
