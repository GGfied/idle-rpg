import type { CSSProperties } from 'react';
import { skillColor } from '@core/progression';
import { CONTENT } from '@app/registry';
import { evaluate } from '@app/game/requirements';
import { skillUnlocks, unlockRequirement } from '@app/game/skillUnlocks';
import type { SkillUnlock } from '@app/game/skillUnlocks';
import type { GameState } from '@app/game/types';
import { useApp } from '@app/ui/context';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { SkillIcon } from '@app/ui/components/SkillIcon';

/** Branch headings by unlock kind; the tool branch is named per skill (axes, pickaxes, ...). */
const KIND_TITLE: Readonly<Record<SkillUnlock['kind'], string>> = {
  tree: 'Trees',
  rock: 'Rocks',
  fish: 'Fish',
  tool: 'Tools',
};
const TOOL_TITLE: Readonly<Record<string, string>> = {
  woodcutting: 'Axes',
  mining: 'Pickaxes',
  fishing: 'Tools',
};
/** Locked nodes never reveal what they are. */
const UNKNOWN = 'Unknown';
const KIND_ORDER: readonly SkillUnlock['kind'][] = ['tree', 'rock', 'fish', 'tool'];

/** A skill's unlock tree: one branch per kind, a chain of nodes by level. Locked nodes stay visible with the reason. */
export function SkillUnlocksView({ skillId, game }: { skillId: string; game: GameState }) {
  const unlocks = skillUnlocks(skillId);
  if (unlocks.length === 0) return null;
  const branches = KIND_ORDER.map((kind) => ({
    kind,
    title: kind === 'tool' ? (TOOL_TITLE[skillId] ?? KIND_TITLE.tool) : KIND_TITLE[kind],
    nodes: unlocks
      .filter((u) => u.kind === kind)
      .map((u) => ({ u, res: evaluate(game, unlockRequirement(u, skillId), CONTENT.items) })),
  })).filter((b) => b.nodes.length > 0);
  return (
    <div
      className="skill-tree"
      style={{ '--skill': skillColor(skillId), '--n': branches.length } as CSSProperties}
      aria-label="Unlocks"
    >
      <strong className="skill-tree-title">Unlocks</strong>
      <div className="skill-tree-root">
        <SkillIcon skillId={skillId as Parameters<typeof SkillIcon>[0]['skillId']} size={32} />
      </div>
      <div className="skill-tree-branches">
        {branches.map((b) => {
          const next = b.nodes.findIndex((n) => !n.res.met);
          return (
            <section key={b.kind} className="skill-branch" aria-label={b.title}>
              <h4 className="skill-branch-head">{b.title}</h4>
              <ul>
                {b.nodes.map(({ u, res }, i) => (
                  <li
                    key={`${u.kind}:${u.itemId}`}
                    className="skill-node"
                    data-locked={!res.met || undefined}
                    data-next={i === next || undefined}
                  >
                    <span className="skill-node-icon">
                      {res.met ? (
                        <ItemSlot itemId={u.itemId} name={u.label} />
                      ) : (
                        <span className="skill-node-unknown" aria-hidden="true">
                          ?
                        </span>
                      )}
                      <span className="skill-node-lv">Lv {u.level}</span>
                    </span>
                    <span className="skill-node-label">{res.met ? u.label : UNKNOWN}</span>
                    {res.met ? null : <span className="skill-node-req">{res.text}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function SkillUnlocks({ skillId }: { skillId: string }) {
  const game = useApp((s) => s.game);
  return <SkillUnlocksView skillId={skillId} game={game} />;
}
