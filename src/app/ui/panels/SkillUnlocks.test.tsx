import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { xpForLevel } from '@core/progression';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import type { GameState } from '@app/game/types';
import { SkillUnlocksView } from '@app/ui/panels/SkillUnlocks';

type Built = 'woodcutting' | 'mining' | 'fishing' | 'cooking';

function at(skill: Built, level: number): GameState {
  const g = newGame(CONTENT);
  return {
    ...g,
    progression: { ...g.progression, xp: { ...g.progression.xp, [skill]: xpForLevel(level) } },
  };
}
const render = (skill: string, game: GameState) =>
  renderToStaticMarkup(<SkillUnlocksView skillId={skill} game={game} />).replace(/<!-- -->/g, '');
/** The <li> node block that contains `needle`, or the whole markup. */
const nodeOf = (html: string, lv: string) =>
  html.split('<li ').find((n) => n.includes(`Lv ${lv}<`) && n.includes('skill-node')) ?? '';

describe('SkillUnlocksView tree', () => {
  it('shows branch headings per skill', () => {
    const html = render('woodcutting', at('woodcutting', 1));
    expect(html).toContain('Trees');
    expect(html).toContain('Axes');
    expect(render('mining', at('mining', 1))).toContain('Pickaxes');
    expect(render('fishing', at('fishing', 1))).toContain('Fish');
    expect(render('cooking', at('cooking', 1))).toContain('Food');
  });

  it.each([
    { level: 1, locked: true },
    { level: 15, locked: false },
  ])('woodcutting lv $level: oak node locked=$locked', ({ level, locked }) => {
    const node = nodeOf(render('woodcutting', at('woodcutting', level)), '15');
    expect(node).not.toBe('');
    if (locked) {
      expect(node).toContain('data-locked="true"');
      expect(node).toContain('Unknown');
      expect(node).toContain('Requires Woodcutting 15 (you: 1)');
      expect(node).not.toContain('Oak logs');
      expect(node).not.toContain('<img');
    } else {
      expect(node).not.toContain('data-locked');
      expect(node).toContain('Oak logs');
      expect(node).not.toContain('Unknown');
      expect(node).not.toContain('Requires');
    }
  });

  it('a locked skill reveals no item name anywhere', () => {
    const html = render('woodcutting', at('woodcutting', 1));
    expect(html).not.toContain('Oak logs');
  });

  it.each(['attack', 'magic'])('%s (not built): renders nothing', (skill) => {
    expect(render(skill, newGame(CONTENT))).toBe('');
  });
});
