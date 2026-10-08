import { StepControl } from '@app/ui/components/StepControl';
import { LOOKS, lookIndex, type PlayerLook } from '@app/ui/characterLook';

/** Presentational: the Character choice (Male / Female). */
export function CharacterRow({
  look,
  onSelect,
}: {
  look: unknown;
  onSelect: (look: PlayerLook) => void;
}) {
  const i = lookIndex(look);
  return (
    <StepControl
      label="Character"
      description={LOOKS[i]!.description}
      options={LOOKS.map((l) => l.label)}
      selected={i}
      onSelect={(n) => onSelect(LOOKS[n]!.look)}
    />
  );
}
