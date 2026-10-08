// Back-compat shim (Q3-B's files import this). The implementation moved to lib.mjs `runParallel`; new tests should use
// runParallel/forEachCombo from lib.mjs (adds renderers, prefixed output, budget). Contract unchanged: returns viewport
// names for this process; the parent spawns one child per name (E2E_VP, E2E_PORT=base+i) and exits with the worst code.
import { runParallel } from './lib.mjs';

export function splitViewports(fileUrl, defaultPort, names) {
  return runParallel(fileUrl, defaultPort, {
    viewports: names,
    renderers: ['webgl'],
    prefix: false,
    plain: true,
  });
}
