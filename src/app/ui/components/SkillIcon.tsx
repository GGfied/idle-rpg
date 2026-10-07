import { skillIconUrl } from '@render/index';

/** Pixelated skill icon at `size` px; renders nothing when the skill has no icon. */
export function SkillIcon({ skillId, size = 20 }: { skillId: string; size?: number }) {
  const url = skillIconUrl(skillId);
  return url ? (
    <img className="skill-icon" src={url} width={size} height={size} alt="" draggable={false} />
  ) : null;
}
