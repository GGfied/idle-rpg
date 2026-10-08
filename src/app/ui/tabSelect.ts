import type { TabId } from '@app/store';

/** The slice of store actions a tab tap needs. */
export interface TabActions {
  settingsOpen: boolean;
  panelOpen: boolean;
  closeSettings(): void;
  setTab(tab: TabId): void;
  togglePanel(): void;
}

/**
 * A tab tap: closes Settings if open, selects the tab, and guarantees its body is
 * visible when the tap had to reveal it (Settings was open or the sheet was folded).
 * setTab toggles the body on a re-tap of the current tab, so re-open it afterwards.
 */
export function selectTab(get: () => TabActions, tab: TabId, folded: boolean): void {
  const reveal = get().settingsOpen || folded;
  if (get().settingsOpen) get().closeSettings();
  get().setTab(tab);
  if (reveal && !get().panelOpen) get().togglePanel();
}
