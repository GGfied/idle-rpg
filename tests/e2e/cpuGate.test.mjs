import { describe, expect, it } from 'vitest';
import { budgetJudge, countHeadlessChromes, gateDecision } from './cpuGate.mjs';

describe('gateDecision', () => {
  const base = { chromes: 0, load1: 1, cpuCount: 8 };
  it.each([
    ['idle machine', {}, 'go'],
    ['3 chromes, below cap 4', { chromes: 3 }, 'go'],
    ['4 chromes = cap', { chromes: 4 }, 'wait'],
    ['9 chromes', { chromes: 9 }, 'wait'],
    ['8 cores: load 5.4 -> go', { load1: 5.4 }, 'go'],
    ['8 cores: load 5.5 -> wait', { load1: 5.5 }, 'wait'],
    ['load 136', { load1: 136 }, 'wait'],
    ['both over', { chromes: 6, load1: 50 }, 'wait'],
    ['custom cap 2, 2 chromes', { chromes: 2, chromeCap: 2 }, 'wait'],
    ['custom cap 2, 1 chrome', { chromes: 1, chromeCap: 2 }, 'go'],
    ['share 1.0: load 7 -> go', { load1: 7, share: 1 }, 'go'],
    ['share 1.0: load 7.1 -> wait', { load1: 7.1, share: 1 }, 'wait'],
    ['share 0.5: load 3.1 -> wait', { load1: 3.1, share: 0.5 }, 'wait'],
    ['2 cores: load 0.6 -> go', { cpuCount: 2, load1: 0.6 }, 'go'],
    ['2 cores: load 0.7 -> wait', { cpuCount: 2, load1: 0.7 }, 'wait'],
  ])('%s -> %s', (_n, over, want) => {
    expect(gateDecision({ ...base, ...over })).toBe(want);
  });
});

describe('countHeadlessChromes', () => {
  it('counts only root headless processes', () => {
    const ps = [
      '100 /Applications/Google Chrome --headless=new --mute-audio --user-data-dir=/x',
      '101 /Applications/Google Chrome Helper --type=renderer --headless=new',
      '102 /Applications/Google Chrome Helper --type=gpu-process --headless',
      '103 /Applications/Google Chrome --headless --remote-debugging-port=0',
      '104 /Applications/Google Chrome --user-data-dir=/user',
      '105 node tests/e2e/foo.mjs',
    ].join('\n');
    expect(countHeadlessChromes(ps)).toBe(2);
  });
  it('empty output is 0', () => expect(countHeadlessChromes('')).toBe(0));
});

describe('budgetJudge', () => {
  const base = { baseMs: 60000, slowdown: 1, cpuSec: 10, cpuUnits: 1 };
  it.each([
    ['under, no gate', { tookMs: 50000 }, true],
    ['over without gate wait', { tookMs: 66500 }, false],
    ['over, gate wait brings it under', { tookMs: 66500, gateMs: 10000 }, true],
    ['still over after subtracting', { tookMs: 90000, gateMs: 10000 }, false],
    ['gate wait larger than wall clamps to 0', { tookMs: 1000, gateMs: 5000 }, true],
    ['slowdown 2 doubles the limit', { tookMs: 110000, slowdown: 2 }, true],
    ['CPU over stays red despite gate wait', { tookMs: 50000, gateMs: 40000, cpuSec: 61 }, false],
  ])('%s -> ok=%s', (_n, over, want) => {
    expect(budgetJudge({ ...base, ...over }).ok).toBe(want);
  });
  it('reports judged wall = took - gate', () => {
    expect(budgetJudge({ ...base, tookMs: 66500, gateMs: 6500 }).judgedMs).toBe(60000);
  });
});
