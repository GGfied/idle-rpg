import type { Requirement } from '@core/contracts';
import type { ToolTable } from '@core/equipment';
import type { GatherDef } from '@core/skills';
import { CONTENT } from '@app/registry';
import { FISHING_SPOTS, FISHING_TOOLS } from '@features/skills/fishing';
import { MINING_NODES, MINING_TOOLS } from '@features/skills/mining';
import { WOODCUTTING_NODES, WOODCUTTING_TOOLS } from '@features/skills/woodcutting';

/** One thing a skill unlocks at a level. `itemId` is the item the player sees (for the shared ItemSlot icon). */
export interface SkillUnlock {
  level: number;
  kind: 'tree' | 'rock' | 'fish' | 'tool';
  label: string;
  itemId: string;
}

interface Raw {
  level: number;
  kind: SkillUnlock['kind'];
  itemId: string;
}

const fromNodes = (nodes: readonly GatherDef[], kind: 'tree' | 'rock'): Raw[] =>
  nodes.flatMap((n) => {
    const itemId = n.yields[0]?.value.itemId;
    return itemId ? [{ level: n.requiredLevel, kind, itemId }] : [];
  });

const fromTools = (tools: ToolTable): Raw[] =>
  [...tools.entries()].map(([itemId, d]) => ({ level: d.levelRequired, kind: 'tool', itemId }));

const fromSpots = (): Raw[] =>
  FISHING_SPOTS.flatMap((s) =>
    Object.values(s.methods).flatMap((m) =>
      m.catches.map((c): Raw => ({ level: c.requiredLevel, kind: 'fish', itemId: c.itemId })),
    ),
  );

/** Sources per skill: data only, one entry here per built skill. */
const SOURCES: Readonly<Record<string, () => Raw[]>> = {
  woodcutting: () => [...fromNodes(WOODCUTTING_NODES, 'tree'), ...fromTools(WOODCUTTING_TOOLS)],
  mining: () => [...fromNodes(MINING_NODES, 'rock'), ...fromTools(MINING_TOOLS)],
  fishing: () => [...fromSpots(), ...fromTools(FISHING_TOOLS)],
};

/** What a skill unlocks, sorted by level then label; deduplicated at the lowest level. Unbuilt skills: []. */
export function skillUnlocks(skillId: string): readonly SkillUnlock[] {
  const raws = Object.hasOwn(SOURCES, skillId) ? SOURCES[skillId]!() : [];
  const best = new Map<string, Raw>();
  for (const r of raws) {
    const key = `${r.kind}:${r.itemId}`;
    const prev = best.get(key);
    if (!prev || r.level < prev.level) best.set(key, r);
  }
  return [...best.values()]
    .map((r) => ({ ...r, label: CONTENT.items.get(r.itemId)?.name ?? r.itemId }))
    .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}

/** The core Requirement for an unlock; evaluate it with `requirementContext` + core's evaluator. */
export function unlockRequirement(unlock: SkillUnlock, skillId: string): Requirement {
  return { type: 'skillLevel', skill: skillId, level: unlock.level };
}
