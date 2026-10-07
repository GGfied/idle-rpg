import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Import-boundary rules mirror CLAUDE.md "Dependency rules".
// Each zone below sets the complete `no-restricted-imports` rule (flat config replaces, not merges).

const LAYERS = ['@features', '@render', '@audio', '@platform', '@app'];

const noParentRelative = {
  group: ['../*', '..'],
  message: 'Use a path alias (@core/*, @features/*, ...) or ./ inside your own module.',
};
const coreDeep = {
  group: ['@core/*/*'],
  message: 'Import a core module only through its index.ts (@core/<module>).',
};
const featureDeep = {
  group: ['@features/*/*', '!@features/skills/*', '@features/skills/*/*'],
  message: 'Import a feature only through its index.ts.',
};
const renderDeep = {
  group: ['@render/*/*'],
  message: 'Import render modules only through their index.ts.',
};
const deepImports = [coreDeep, featureDeep, renderDeep];

const ban = (names, message) => ({ group: names.flatMap((n) => [n, `${n}/*`]), message });
const banLayers = (names, why) => ban(names, why);

const PHASER = ['phaser'];
const REACT = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];
const STATE = ['zustand', 'zustand/*'];

const zone = (files, patterns, paths = []) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { paths, patterns }] },
});
const pathsFor = (names, message) => names.map((name) => ({ name, message }));

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'docs', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Default for everything in src: no parent-relative imports, no deep imports.
  zone(['src/**/*.{ts,tsx}', 'tests/**/*.ts'], [noParentRelative, ...deepImports]),

  // core: pure TypeScript, imports nothing outside core.
  zone(
    ['src/core/**/*.{ts,tsx}'],
    [
      noParentRelative,
      coreDeep,
      banLayers(LAYERS, 'core/ must not import features, render, audio, platform or app.'),
    ],
    pathsFor(
      [...PHASER, ...REACT, ...STATE],
      'core/ is pure TypeScript (no Phaser/React/Zustand).',
    ),
  ),
  // The engine, contracts, utils and skills machinery may only use core/utils and core/contracts.
  zone(
    [
      'src/core/engine/**/*.ts',
      'src/core/contracts/**/*.ts',
      'src/core/utils/**/*.ts',
      'src/core/skills/**/*.ts',
    ],
    [
      noParentRelative,
      coreDeep,
      banLayers(LAYERS, 'core/ must not import features, render, audio, platform or app.'),
      {
        group: [
          '@core/items',
          '@core/inventory',
          '@core/persistence',
          '@core/progression',
          '@core/equipment',
        ],
        message:
          'core/engine, contracts, utils and skills depend only on core/utils and core/contracts.',
      },
    ],
    pathsFor(
      [...PHASER, ...REACT, ...STATE],
      'core/ is pure TypeScript (no Phaser/React/Zustand).',
    ),
  ),

  // features/*: core only. Never another feature, render or app.
  zone(
    ['src/features/**/*.{ts,tsx}'],
    [
      noParentRelative,
      coreDeep,
      banLayers(
        ['@features'],
        'A feature must not import another feature; use ids, events, contracts.',
      ),
      banLayers(['@render', '@audio', '@platform', '@app'], 'features/ depends on core only.'),
    ],
    pathsFor([...PHASER, ...REACT, ...STATE], 'Feature logic is pure TypeScript.'),
  ),

  // render: core (types only, by convention) plus Phaser; never game logic.
  zone(
    ['src/render/**/*.{ts,tsx}'],
    [
      noParentRelative,
      coreDeep,
      renderDeep,
      banLayers(
        ['@features', '@app', '@audio', '@platform'],
        'render/ reads state; it never imports game logic.',
      ),
    ],
    pathsFor([...REACT, ...STATE], 'render/ uses Phaser only; React is for app/ui.'),
  ),

  // audio and platform: core only (plus Phaser types).
  zone(
    ['src/audio/**/*.{ts,tsx}', 'src/platform/**/*.{ts,tsx}'],
    [
      noParentRelative,
      coreDeep,
      banLayers(['@features', '@render', '@app'], 'audio/ and platform/ depend on core only.'),
      banLayers(['@audio', '@platform'], 'audio/ and platform/ do not import each other.'),
    ],
    pathsFor([...REACT, ...STATE], 'audio/ and platform/ do not use React or Zustand.'),
  ),

  // app: integration layer, may import everything; Phaser only in scenes, React only in ui.
  zone(
    ['src/app/**/*.{ts,tsx}'],
    [noParentRelative, ...deepImports],
    [
      ...pathsFor(PHASER, 'Phaser is only for render/ and app/scenes/.'),
      ...pathsFor(REACT, 'React is only for app/ui/.'),
    ],
  ),
  zone(
    ['src/app/scenes/**/*.{ts,tsx}'],
    [noParentRelative, ...deepImports],
    pathsFor(REACT, 'React is only for app/ui/.'),
  ),
  zone(
    ['src/app/ui/**/*.{ts,tsx}'],
    [noParentRelative, ...deepImports],
    pathsFor(PHASER, 'Phaser is not for app/ui.'),
  ),

  // Browser e2e scripts run in Node (dependency-free, no `globals` package).
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        URL: 'readonly',
        WebSocket: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        Buffer: 'readonly',
      },
    },
  },

  // test-utils and tests may reach any layer (through public index.ts).
  zone(['src/test-utils/**/*.ts', 'tests/**/*.ts'], [noParentRelative, ...deepImports]),
);
