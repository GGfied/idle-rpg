import { describe, expect, it } from 'vitest';
import { selectTab, type TabActions } from '@app/ui/tabSelect';
import type { TabId } from '@app/store';

function fake(init: { settingsOpen: boolean; panelOpen: boolean; tab: TabId }) {
  const s = {
    ...init,
    closeSettings() {
      s.settingsOpen = false;
    },
    setTab(tab: TabId) {
      s.panelOpen = s.tab === tab ? !s.panelOpen : true;
      s.tab = tab;
    },
    togglePanel() {
      s.panelOpen = !s.panelOpen;
    },
  } satisfies TabActions & { tab: TabId };
  return s;
}

describe('selectTab', () => {
  it('closes Settings and selects the tapped tab', () => {
    const s = fake({ settingsOpen: true, panelOpen: true, tab: 'inventory' });
    selectTab(() => s, 'skills', false);
    expect(s.settingsOpen).toBe(false);
    expect(s.tab).toBe('skills');
    expect(s.panelOpen).toBe(true);
  });
  it('re-tapping the current tab from Settings still shows its body', () => {
    const s = fake({ settingsOpen: true, panelOpen: true, tab: 'skills' });
    selectTab(() => s, 'skills', false);
    expect(s.settingsOpen).toBe(false);
    expect(s.panelOpen).toBe(true);
  });
  it('without Settings, re-tapping the current tab toggles the body shut', () => {
    const s = fake({ settingsOpen: false, panelOpen: true, tab: 'skills' });
    selectTab(() => s, 'skills', false);
    expect(s.panelOpen).toBe(false);
  });
  it('a folded sheet is revealed even on the already-open tab', () => {
    const s = fake({ settingsOpen: false, panelOpen: true, tab: 'skills' });
    selectTab(() => s, 'skills', true);
    expect(s.panelOpen).toBe(true);
  });
});
