import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Path aliases are defined once, in tsconfig.json, and picked up here.
export default defineConfig({
  // Build version shown in settings; declared in src/env.d.ts. Bump package.json to release.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/e2e/*.test.mjs'],
  },
});
