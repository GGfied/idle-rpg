import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

// E2E-only: other sessions edit src/ while a browser run is in flight, and Vite's HMR then reloads
// the page under the test. Freeze file watching so a run sees one consistent build.
export default defineConfig({
  root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  plugins: [react(), tsconfigPaths()],
  server: { hmr: false, watch: { ignored: ['**/*'] } },
});
