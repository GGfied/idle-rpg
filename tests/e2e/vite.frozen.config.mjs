import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const portIdx = process.argv.indexOf('--port');
const port = portIdx >= 0 ? process.argv[portIdx + 1] : `pid${process.pid}`;

// E2E-only: other sessions edit src/ while a browser run is in flight, and Vite's HMR then reloads
// the page under the test. Freeze file watching so a run sees one consistent build.
//
// NEVER share Vite's dependency cache with the user's dev server (default node_modules/.vite, also
// reached through the node_modules symlink of scratch copies): a test server re-optimising deps rewrote
// node_modules/.vite/deps under the live :5173 server and crashed its HUD (2026-10-08). Each test server
// gets its own cacheDir outside node_modules, keyed by port and root.
const key = createHash('sha1').update(root).digest('hex').slice(0, 8);
export default defineConfig({
  root,
  cacheDir: join(tmpdir(), `idle-rpg-vite-e2e-${port}-${key}`),
  plugins: [react(), tsconfigPaths()],
  server: { hmr: false, watch: { ignored: ['**/*'] } },
});
