import { facilityDef, optionsFor } from '@features/facilities';
import { getNpcDef, optionsFor as npcOptions } from '@features/npc';

/** One right-click / long-press entry; `optionId` is absent for Examine. */
export interface MenuEntry {
  label: string;
  optionId?: string;
}

/** Facility menu: its options (first = default action), then Examine. Cancel is added by the scene. */
export function facilityMenu(kind: string): { title: string; entries: MenuEntry[] } {
  const name = facilityDef(kind)?.name ?? kind;
  return {
    title: name,
    entries: [
      ...optionsFor(kind).map((o) => ({ label: `${o.label} ${name}`, optionId: o.id })),
      { label: `Examine ${name}` },
    ],
  };
}

/** NPC menu: its options (first = default, e.g. Talk-to), then Examine. */
export function npcMenu(npcId: string): { title: string; entries: MenuEntry[] } {
  const name = getNpcDef(npcId)?.name ?? npcId;
  return {
    title: name,
    entries: [
      ...npcOptions(npcId).map((o) => ({ label: `${o.label} ${name}`, optionId: o.id })),
      { label: `Examine ${name}` },
    ],
  };
}
