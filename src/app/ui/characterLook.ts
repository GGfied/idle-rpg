/** Player look pref values. Mirrors `Preferences.playerLook` once persistence adds it. */
export type PlayerLook = 'player' | 'player_f';

/** Settings options, in display order. `label` is shown; `look` is stored. */
export const LOOKS: { label: string; look: PlayerLook; description: string }[] = [
  { label: 'Male', look: 'player', description: 'Your character looks male' },
  { label: 'Female', look: 'player_f', description: 'Your character looks female' },
];

/** Unknown / missing values fall back to the default look. */
export function lookIndex(look: unknown): number {
  const i = LOOKS.findIndex((l) => l.look === look);
  return i < 0 ? 0 : i;
}
