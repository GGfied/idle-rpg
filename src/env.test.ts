import { describe, expect, it } from 'vitest';
// Root config file, outside any alias; the one legitimate parent-relative import.
// eslint-disable-next-line no-restricted-imports
import pkg from '../package.json';

describe('__APP_VERSION__', () => {
  it('is injected from package.json and is semver', () => {
    expect(__APP_VERSION__).toBe(pkg.version);
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
