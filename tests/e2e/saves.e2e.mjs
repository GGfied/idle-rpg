// Save safety in the real browser: load v1/v2 fixtures, corrupt save backup, two-tab lease, far-away progress.
// Run: node tests/e2e/saves.e2e.mjs   (ports 9351-9352, E2E_PORT overrides; fast base: parallel desktop + phone children)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, expect, runParallel, withCombos } from './lib.mjs';

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/core/persistence/fixtures');
const fixture = (n) => readFileSync(resolve(FIX, n), 'utf8');
const SAVE = 'idle-rpg:save:1';
const CORRUPT = 'idle-rpg:save:1:corrupt';
const PORT = 9351;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});
const port = Number(process.env.E2E_PORT ?? PORT);
const URL = `http://127.0.0.1:${port}/?tickMs=60`;
const J = JSON.stringify;
// Spy on the runtime's debounced save timer (SAVE_DEBOUNCE_MS = 1000 in src/app/runtime.ts): counts timers scheduled /
// fired from runtime.ts, so "no save happened" checks wait for the real debounce to fire instead of a fixed sleep.
const SAVE_TIMER_SPY = `(() => { if (window.__saveT) return; const T = (window.__saveT = { scheduled: 0, fired: 0 });
  const o = window.setTimeout; window.setTimeout = function (fn, ms, ...a) {
    if (ms === 1000 && typeof fn === 'function' && /runtime[.]ts/.test(new Error().stack || '')) {
      T.scheduled++; const f = fn; fn = function (...b) { try { return f.apply(this, b); } finally { T.fired++; } }; }
    return o.call(this, fn, ms, ...a); }; })();`;
const saveT = (g) => g.eval(`({ ...window.__saveT })`);
/** Wait until a debounced runtime save scheduled after `since` has fired (and none is pending). */
async function debounceFired(g, since) {
  await g.waitFor(
    async () => {
      const t = await saveT(g);
      return t.fired > since.fired && t.fired === t.scheduled;
    },
    { timeoutMs: 8000, label: 'debounced save fired' },
  );
}

/** Boot with localStorage seeded (key->string) BEFORE the game script runs; seed script is removed afterwards. */
async function bootSeeded(g, seed) {
  const { cdp } = g;
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Storage.clearDataForOrigin', {
    origin: URL.split('/?')[0],
    storageTypes: 'local_storage',
  });
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const s = ${J(seed)}; for (const k in s) localStorage.setItem(k, s[k]); })();`,
  });
  await cdp.send('Page.navigate', { url: URL });
  await ready(g);
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
}
const ready = async (g) => {
  await g.waitFor(() => g.page('ready()').catch(() => false), { timeoutMs: 25000, label: 'ready' });
};
const stored = (g, key = SAVE) => g.eval(`localStorage.getItem(${J(key)})`);
const parsed = async (g) => JSON.parse(await stored(g));
const logs = (g) =>
  g.eval(
    `window.__e.game().inventory.slots.reduce((n, s) => n + (s && s.itemId === 'logs' ? s.quantity : 0), 0)`,
  );
const xp = (g, skill = 'woodcutting') => g.eval(`window.__e.game().progression.xp.${skill}`);

await withCombos(
  { port: PORT, budgetMs: BUDGET_MS, initScripts: [SAVE_TIMER_SPY] },
  COMBOS,
  async (g, vp) => {
    for (const [file, ver] of [
      ['save-v1.json', 1],
      ['save-v2.json', 2],
    ]) {
      await check(
        `load-v${ver}`,
        `${file} in storage boots with its progress, saved back as current`,
        async () => {
          await bootSeeded(g, { [SAVE]: fixture(file) });
          const pos = await g.state('movement.position');
          const n = await logs(g);
          const w = await xp(g);
          expect(n === 14, `logs ${n}`);
          expect(w === 1154, `woodcutting xp ${w}`);
          // fixture tile (12,9) is blocked in the current big world (banker row): the loader must fall back to spawn
          const walk = await g.eval(
            `import('/src/features/world/index.ts').then((w) => w.createWorldCollisionGrid().isWalkable(12, 9))`,
          );
          const want = walk ? { x: 12, y: 9 } : { x: 18, y: 15 };
          expect(
            pos.x === want.x && pos.y === want.y,
            `pos ${J(pos)} want ${J(want)} (12,9 walkable=${walk})`,
          );
          expect(
            (await g.chatLines()).some((l) => /Welcome back/.test(l)),
            'no Welcome back',
          );
          // trigger a progress save (debounce 1 s of wall clock)
          await g.setXp('woodcutting', 1155);
          await g.waitFor(async () => (await parsed(g)).version !== ver, {
            timeoutMs: 5000,
            label: 'rewritten',
          });
          const s = await parsed(g);
          expect(s.version === 3, `saved version ${s.version}`);
          expect(s.data.hp && s.data.prayer, 'hp/prayer missing after migration');
          expect(s.data.progression.xp.woodcutting === 1155, 'xp not saved');
          const c = s.data.inventory.slots
            .filter((x) => x && x.itemId === 'logs')
            .reduce((a, x) => a + x.quantity, 0);
          expect(c === 14, `saved logs ${c}`);
          return `${vp}: v${ver} -> v${s.version}, logs 14, xp 1154->1155, pos ${J(pos)} (12,9 walkable=${walk}), hp ${J(s.data.hp)}`;
        },
      );
    }
    if (vp !== 'desktop') return;

    await check(
      'corrupt',
      'corrupt save: boots fresh, raw kept as backup, original not overwritten',
      async () => {
        const bad = '{"version":3,"data":{"inventory":BROKEN';
        await bootSeeded(g, { [SAVE]: bad });
        const pos = await g.state('movement.position');
        const banner = await g.store('s.banner');
        expect(banner && banner.canStartFresh, `banner ${J(banner)}`);
        expect((await xp(g)) !== 1154, 'loaded progress from corrupt save?');
        expect((await stored(g, CORRUPT)) === bad, `backup ${await stored(g, CORRUPT)}`);
        const t0 = await saveT(g);
        await g.setXp('woodcutting', 5000);
        await debounceFired(g, t0); // the debounced save ran (and must have written nothing)
        expect((await stored(g)) === bad, 'corrupt save was overwritten while saving locked');
        return `fresh pos ${J(pos)}, banner "${banner.text.slice(0, 50)}...", backup === raw, save untouched after progress (debounce fired ${J(await saveT(g))})`;
      },
    );

    await check(
      'two-tabs',
      'second tab (same-origin iframe) loads A progress; stale A cannot overwrite',
      async () => {
        await bootSeeded(g, {});
        await g.setXp('woodcutting', 2000);
        await g.waitFor(async () => (await stored(g)) !== null, {
          timeoutMs: 5000,
          label: 'A first save',
        });
        // no debounced A save still pending before B opens
        await g.waitFor(
          async () => {
            const t = await saveT(g);
            return t.fired === t.scheduled;
          },
          { label: 'A idle' },
        );
        const leaseA = await stored(g, 'idle-rpg:session');
        await g.eval(
          `(() => { const f = document.createElement('iframe'); f.id = 'tabB'; f.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px;z-index:99999'; f.src = ${J(URL)}; document.body.appendChild(f); })()`,
        );
        await g.waitFor(
          () =>
            g.eval(
              `(() => { try { return !!document.getElementById('tabB').contentWindow.__idleRpg.store.getState().game; } catch { return false; } })()`,
            ),
          { label: 'B ready' },
        );
        const B = `document.getElementById('tabB').contentWindow.__idleRpg.store.getState()`;
        const bxp = await g.eval(`${B}.game.progression.xp.woodcutting`);
        expect(bxp === 2000, `B booted with xp ${bxp}, not A's 2000`);
        const leaseB = await stored(g, 'idle-rpg:session');
        expect(leaseB !== leaseA, 'lease not taken by B');
        // A (stale) makes progress: must not reach storage
        const t1 = await saveT(g);
        await g.setXp('woodcutting', 9999);
        await debounceFired(g, t1); // A's debounced save ran and saw B's lease
        const s = await parsed(g);
        expect(
          s.data.progression.xp.woodcutting === 2000,
          `A overwrote: stored xp ${s.data.progression.xp.woodcutting}`,
        );
        const banner = await g.store('s.banner');
        expect(banner && /another tab/.test(banner.text), `A banner ${J(banner)}`);
        // B progress does save
        await g.eval(
          `(() => { const s = document.getElementById('tabB').contentWindow.__idleRpg.store; const g = s.getState().game; s.setState({ game: { ...g, progression: { ...g.progression, xp: { ...g.progression.xp, woodcutting: 2500 } } } }); })()`,
        );
        await g
          .waitFor(async () => (await parsed(g)).data.progression.xp.woodcutting === 2500, {
            timeoutMs: 8000,
            label: 'B saved 2500',
          })
          .catch(() => {});
        expect(
          (await parsed(g)).data.progression.xp.woodcutting === 2500,
          'B (newest) did not save',
        );
        await g.eval(`document.getElementById('tabB').remove()`);
        await g.cdp.send('Page.reload');
        await ready(g);
        const after = await xp(g);
        expect(after === 2500, `after reload xp ${after}`);
        return `B booted xp 2000, lease changed, stale A (9999) not stored, A banner shown, B saved 2500, reload -> ${after}`;
      },
    );

    await check('far-world', 'Fernhaven chop survives reload', async () => {
      await bootSeeded(g, {});
      const t = (
        await g.eval(
          `import('/src/app/registry.ts').then((r) => [...r.CONTENT.trees].map(([id, t]) => ({ id, x: t.x, y: t.y, d: t.defId })))`,
        )
      ).find((o) => /^fern/.test(o.id) && o.d === 'tree');
      expect(t, 'no fern tree');
      await g.setInventory(['bronze_axe']);
      await g.teleport(t.x, t.y + 3);
      const pt = await g.tileClient(t.x, t.y, -12);
      await g.tap(pt.x, pt.y);
      await g
        .waitFor(async () => (await logs(g)) >= 1, { timeoutMs: 20000, label: 'log in Fernhaven' })
        .catch(async (e) => {
          throw new Error(
            `${e.message}; tree ${J(t)} pos ${J(await g.state('movement.position'))} tapped ${J(pt)} chat ${J((await g.chatLines()).slice(-3))} pending ${J(await g.state('pendingInteraction'))}`,
          );
        });
      // end the chop session so the state is still, then wait until the save holds exactly the live state
      await g.update('({ ...g, gathering: { ...g.gathering, session: null } })');
      await g.waitFor(
        async () => {
          const s = await parsed(g).catch(() => null);
          if (!s) return false;
          const t = await saveT(g);
          const savedLogs = s.data.inventory.slots
            .filter((x) => x && x.itemId === 'logs')
            .reduce((a, x) => a + x.quantity, 0);
          return (
            t.fired === t.scheduled &&
            J(s.data.movement.position) === J(await g.state('movement.position')) &&
            savedLogs === (await logs(g)) &&
            s.data.progression.xp.woodcutting === (await xp(g))
          );
        },
        { timeoutMs: 8000, label: 'save holds live state' },
      );
      const before = {
        pos: await g.state('movement.position'),
        logs: await logs(g),
        xp: await xp(g),
      };
      expect(before.pos.x > 60, `not in the far world: ${J(before.pos)}`);
      await g.cdp.send('Page.reload');
      await ready(g);
      const after = {
        pos: await g.state('movement.position'),
        logs: await logs(g),
        xp: await xp(g),
      };
      expect(J(after.pos) === J(before.pos), `pos ${J(before.pos)} -> ${J(after.pos)}`);
      expect(after.logs >= 1 && after.xp >= before.xp - 0, `logs/xp ${J(before)} -> ${J(after)}`);
      return `before ${J(before)} after ${J(after)}`;
    });
  },
);
