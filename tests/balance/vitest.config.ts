import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Run: npx vitest run --config tests/balance/vitest.config.ts
export default defineConfig({
  root: '/Users/Derrick/Projects/idle-rpg',
  plugins: [tsconfigPaths()],
  test: { environment: 'node', include: ['tests/balance/**/*.test.ts'], testTimeout: 300000 },
});
