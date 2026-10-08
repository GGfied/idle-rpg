/** Context-menu options for an inventory item: primary action first, Cancel last. */
export interface ItemMenuOption {
  label: string;
  onSelect: () => void;
}

export interface ItemMenuActions {
  /** Present only while "Use" is available. */
  use?: () => void;
  drop: () => void;
  examine: () => void;
  /** Light the logs (store action); only offered for lightable logs. */
  light?: () => void;
}

export function itemMenuOptions(a: ItemMenuActions, lightable: boolean): ItemMenuOption[] {
  return [
    ...(lightable && a.light ? [{ label: 'Light', onSelect: a.light }] : []),
    ...(a.use ? [{ label: 'Use', onSelect: a.use }] : []),
    { label: 'Drop', onSelect: a.drop },
    { label: 'Examine', onSelect: a.examine },
    { label: 'Cancel', onSelect: () => undefined },
  ];
}
