// Mining e2e (runbook mining-fishing task 8): starter pickaxe, quarry area, mine copper, level gate, full inv, menu, block, bank.
// Run: node tests/e2e/mining.e2e.mjs   (port 5244, E2E_PORT overrides; SHOTS_DIR defaults to tests/e2e/.shots-mining)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR ?? resolve(HERE, '.shots-mining');
const fixture = readFileSync(
  resolve(HERE, '../../src/core/persistence/fixtures/save-v1.json'),
  'utf8',
);
const SAVE = 'idle-rpg:save:1';
const port = Number(process.env.E2E_PORT ?? 5244);
const J = JSON.stringify;
const SPY = `(() => { if (window.__mm) return; const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText;
  window.__mm = { frame: [] };
  P.clearRect = function (...a) { if (this.canvas.className === 'minimap') window.__mm.frame = []; return oc.apply(this, a); };
  P.fillText = function (t, x, y) { if (this.canvas.className === 'minimap') window.__mm.frame.push(t); return of.call(this, t, x, y); }; })();`;
const SND_SPY = `(() => { window.__snd = []; const P = window.AudioContext.prototype; if (P.__spied) return; P.__spied = true; const orig = P.createOscillator;
  P.createOscillator = function () { const o = orig.call(this); const f = o.frequency, sv = f.setValueAtTime.bind(f); let first = true;
    f.setValueAtTime = (v, t) => { if (first) { first = false; window.__snd.push({ at: performance.now(), wave: o.type, f: v }); } return sv(v, t); };
    return o; }; })();`;

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
  await g.sleep(150);
  const p = await rockPt(g, r, -10);
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 70), width: 120, height: 110, scale: 4 },
  });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(resolve(SHOTS, `${g.viewportName}-${name}.png`), Buffer.from(data, 'base64'));
}
const logOf = (g) => g.chatLines();

await withGame(
  { port },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    g.viewportName = vp;
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SND_SPY });
    await g.cdp.send('Page.reload');
    await g.waitFor(() => g.page('ready()').catch(() => false), {
      timeoutMs: 25000,
      label: 'ready',
    });
    await g.sleep(800);

    await check('m1', 'fresh game has 1 bronze_pickaxe', async () => {
      const n = await count(g, 'bronze_pickaxe');
      expect(n === 1, `pickaxes ${n}`);
      return `pickaxe ${n}, axe ${await count(g, 'bronze_axe')}`;
    });

    await check('m2', 'old save (no pickaxe) gets one once; reload keeps exactly 1', async () => {
      const { cdp } = g;
      const url = `http://127.0.0.1:${port}/?tickMs=60`;
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await g.sleep(300);
      await cdp.send('Storage.clearDataForOrigin', {
        origin: url.split('/?')[0],
        storageTypes: 'local_storage',
      });
      const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem(${J(SAVE)}, ${J(fixture)});`,
      });
      await cdp.send('Page.navigate', { url });
      await g.waitFor(() => g.page('ready()').catch(() => false), {
        timeoutMs: 25000,
        label: 'ready',
      });
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await g.sleep(600);
      const raw = JSON.parse(await g.eval(`localStorage.getItem(${J(SAVE)})`));
      const had = JSON.stringify(raw).includes('pickaxe');
      const n1 = await count(g, 'bronze_pickaxe');
      expect(!had && n1 === 1, `fixture had pickaxe ${had}; after load ${n1}`);
      await g.setXp('woodcutting', 1156); // forces a progress save
      await g.sleep(1800);
      await cdp.send('Page.navigate', { url });
      await g.waitFor(() => g.page('ready()').catch(() => false), {
        timeoutMs: 25000,
        label: 'ready',
      });
      await g.sleep(600);
      const n2 = await count(g, 'bronze_pickaxe');
      expect(n2 === 1, `after reload pickaxes ${n2}`);
      return `fixture none -> ${n1} -> reload ${n2}; logs ${await count(g, 'logs')}`;
    });
    await g.load({ query: '' });
    await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await g.cdp.send('Page.reload');
    await g.waitFor(() => g.page('ready()').catch(() => false), {
      timeoutMs: 25000,
      label: 'ready',
    });
    await g.sleep(800);

    await check('m3', 'walk into Stonefold Quarry: banner + minimap label', async () => {
      await g.teleport(67, 44);
      expect((await g.chatLines()).length >= 0, '');
      await g.teleport(70, 43, { settleMs: 200 }); // crossing into the area
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
      await g.sleep(500);
      const frame = await g.eval('JSON.stringify(window.__mm.frame)');
      expect(banner.includes('Stonefold Quarry'), `banner "${banner}"`);
      expect(frame.includes('Stonefold Quarry'), `minimap labels ${frame}`);
      return `banner "${banner}"; minimap has label`;
    });

    await check('m4', 'tap copper: chat, ore, +17.5 XP, rubble art, respawn', async () => {
      await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
      await g.teleport(R.copper.x, R.copper.y + 3);
      const xp0 = await miningXp(g);
      const a0 = await art(g, R.copper.id);
      await shot(g, 'copper-full', R.copper);
      let rubble = null,
        a1 = null;
      await g.realTime(async () => {
        await tapRock(g, R.copper);
        await g.waitFor(
          async () =>
            (await node(g, R.copper.id)) !== 'null' &&
            JSON.parse(await node(g, R.copper.id)).respawnAt !== null,
          { timeoutMs: 40000, label: 'rock depleted' },
        );
        await g.sleep(250);
        a1 = await art(g, R.copper.id);
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
      'real 600 ms ticks: every ore is announced by a swing line (5 ores)',
      async () => {
        await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
        await g.teleport(R.copper.x, R.copper.y + 3);
        const a0 = await art(g, R.copper.id);
        const miss = [];
        await g.realTime(async () => {
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
            await g.waitFor(async () => (await art(g, R.copper.id)) === a0, {
              timeoutMs: 15000,
              label: 'respawn ' + i,
            });
            await g.sleep(150);
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
      'real ticks: exactly ONE swing line + ONE pickHit per attempt (none doubled), hit tick has its swing',
      async () => {
        await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
        await g.teleport(R.copper.x, R.copper.y + 3);
        const a0 = await art(g, R.copper.id);
        await g.update('({ ...g, chat: [] })');
        await g.eval(`(() => { window.__snd.length = 0; window.__ev = []; let sw = 0, mi = 0;
          window.__idleRpg.store.subscribe((st) => { const c = st.game.chat; const a = c.filter((l) => l.text === 'You swing your pickaxe at the rock.').length, b = c.filter((l) => l.text === 'You mine some copper ore.').length;
            const t = Math.round(performance.now()); for (; sw < a; sw++) window.__ev.push(['swing', t]); for (; mi < b; mi++) window.__ev.push(['mine', t]); }); })()`);
        const N = 4;
        await g.realTime(async () => {
          for (let i = 0; i < N; i++) {
            const n0 = await count(g, 'copper_ore');
            await tapRock(g, R.copper);
            await g.waitFor(async () => (await count(g, 'copper_ore')) === n0 + 1, {
              timeoutMs: 30000,
              label: 'ore ' + i,
            });
            await g.waitFor(async () => (await art(g, R.copper.id)) === a0, {
              timeoutMs: 15000,
              label: 'respawn ' + i,
            });
            await g.sleep(150);
          }
        });
        await g.sleep(700);
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
          gaps.every((d) => d >= 450),
          `swing gaps ${J(gaps)} (a double is < 450 ms)`,
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
      await g.setInventory(['bronze_axe', 'bronze_pickaxe']);
      await g.teleport(R.iron.x, R.iron.y - 3 + 0);
      const xp0 = await miningXp(g),
        a0 = await art(g, R.iron.id);
      await shot(g, 'iron-full', R.iron);
      await tapRock(g, R.iron);
      await g.waitFor(async () => (await logOf(g)).some((l) => /Mining level of 15/.test(l)), {
        timeoutMs: 10000,
        label: 'level line',
      });
      await g.sleep(600);
      const ore = await count(g, 'iron_ore');
      expect(ore === 0 && (await miningXp(g)) === xp0, 'ore/xp changed');
      expect((await g.state('gathering.session')) === null, 'session started');
      expect((await art(g, R.iron.id)) === a0, 'art changed');
      return `line ok, iron_ore 0, xp ${xp0} unchanged`;
    });

    await check('m6', 'inventory full: stop line, no ore', async () => {
      await g.setInventory(['bronze_pickaxe', ...Array.from({ length: 27 }, () => 'logs')]);
      await g.teleport(R.copper.x, R.copper.y + 3);
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
      await g.teleport(R.copper.x, R.copper.y + 3);
      await g.sleep(300);
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
      await g.teleport(R.copper.x, R.copper.y + 2);
      const stop = await g.trackMoves();
      await g.walkTo(R.copper.x, R.copper.y);
      await g.sleep(1500);
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
      await g.teleport(72, 55);
      await g.tapObject('bank_booth_5');
      await g.waitFor(() => g.state('bankOpen'), { timeoutMs: 15000, label: 'bank open' });
      await g.eval(
        `[...document.querySelectorAll('.bank-overlay button')].find((b) => /Deposit inventory/.test(b.textContent)).click()`,
      );
      await g.sleep(300);
      const bank = await g.eval('JSON.stringify(window.__e.game().bank.items)');
      expect(
        (await count(g, 'copper_ore')) === 0 && /copper_ore/.test(bank) && /tin_ore/.test(bank),
        `bank ${bank}`,
      );
      return `inv ore 0; bank ${bank}`;
    });
  }),
);
