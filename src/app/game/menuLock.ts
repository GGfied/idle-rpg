import { getMethod, minLevel } from '@features/skills/fishing';
import type { Content } from '@app/registry';
import { evaluate } from '@app/game/requirements';
import type { GameState } from '@app/game/types';
import type { MenuOption } from '@app/store';

/**
 * The unmet-requirement line for acting on a gather node (tree/rock) or fishing spot def, or
 * undefined when the player meets it (or the def is unknown). Text comes from the one evaluator.
 */
export function lockedReason(
  game: GameState,
  content: Content,
  target: { kind: 'node' | 'spot'; defId: string },
): string | undefined {
  const req = requirementFor(content, target);
  if (!req) return undefined;
  const r = evaluate(
    game,
    { type: 'skillLevel', skill: req.skill, level: req.level },
    content.items,
  );
  return r.met ? undefined : r.text;
}

/** A menu entry that, when locked, shows the reason and only posts it to chat when chosen. */
export function lockableOption(
  option: MenuOption,
  reason: string | undefined,
  say: (text: string) => void,
): MenuOption {
  return reason ? { label: option.label, locked: reason, onSelect: () => say(reason) } : option;
}

function requirementFor(
  content: Content,
  target: { kind: 'node' | 'spot'; defId: string },
): { skill: string; level: number } | undefined {
  if (target.kind === 'node') {
    const d = content.gatherDefs.get(target.defId);
    return d ? { skill: d.skill, level: d.requiredLevel } : undefined;
  }
  const m = getMethod(target.defId);
  return m ? { skill: 'fishing', level: minLevel(m.def) } : undefined;
}
