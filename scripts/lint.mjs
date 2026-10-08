// `npm run lint`: runs ESLint (with the import-boundary rules) and `prettier --check`
// in parallel, both cached under node_modules/.cache. Fails if either fails.
// Pass `--no-cache` for a cold run (CI caches nothing anyway).
import { spawn } from 'node:child_process';

const cache = !process.argv.includes('--no-cache');
const bin = (name) => `node_modules/.bin/${name}`;
const jobs = [
  [
    'eslint',
    bin('eslint'),
    [
      '.',
      ...(cache
        ? [
            '--cache',
            '--cache-strategy',
            'content',
            '--cache-location',
            'node_modules/.cache/eslint/',
          ]
        : []),
    ],
  ],
  [
    'prettier',
    bin('prettier'),
    [
      '--check',
      '.',
      ...(cache
        ? [
            '--cache',
            '--cache-strategy',
            'content',
            '--cache-location',
            'node_modules/.cache/prettier/.prettier-cache',
          ]
        : []),
    ],
  ],
];

const run = ([name, cmd, args]) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ name, code: 1, out: String(e) }));
    child.on('close', (code) => resolve({ name, code: code ?? 1, out }));
  });

const results = await Promise.all(jobs.map(run));
for (const r of results) {
  console.log(`--- ${r.name}: ${r.code === 0 ? 'ok' : 'FAILED'}`);
  if (r.out.trim()) console.log(r.out.trimEnd());
}
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
