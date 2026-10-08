import { useEffect } from 'react';
import type { TabId } from '@app/store';
import { useApp, useRuntime } from '@app/ui/context';
import { AreaBanner } from '@app/ui/components/AreaBanner';
import { ContextMenu } from '@app/ui/components/ContextMenu';
import { UseHint } from '@app/ui/components/UseHint';
import { DialoguePanel } from '@app/ui/panels/DialoguePanel';
import { BankPanel } from '@app/ui/panels/BankPanel';
import { LevelUpPopup, SkillTracker } from '@app/ui/panels/Notices';
import { Minimap, Orbs } from '@app/ui/panels/Minimap';
import { ChatBox } from '@app/ui/panels/ChatBox';
import { InventoryPanel } from '@app/ui/panels/InventoryPanel';
import { SkillsPanel } from '@app/ui/panels/SkillsPanel';
import { useHud, useSetPref } from '@app/ui/prefs';
import { useFold } from '@app/ui/hudFold';
import { useHudInset } from '@app/ui/useHudInset';
import { SettingsButton, SettingsPanel, useSettingsOpen } from '@app/ui/panels/SettingsPanel';

const TABS: { id: TabId; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'skills', label: 'Skills' },
];

function Banner() {
  const banner = useApp((s) => s.banner);
  const { startFresh } = useRuntime();
  if (!banner) return null;
  return (
    <div className="banner" role="alert">
      <span>{banner.text}</span>
      {banner.canStartFresh ? (
        <button type="button" onClick={startFresh}>
          Start fresh
        </button>
      ) : null}
    </div>
  );
}

function MenuLayer() {
  const menu = useApp((s) => s.menu);
  const closeMenu = useApp((s) => s.closeMenu);
  return menu ? <ContextMenu {...menu} onClose={closeMenu} /> : null;
}

/** Desktop: right sidebar. Phone portrait: bottom sheet (CSS only, same components). */
export function Hud() {
  const tab = useApp((s) => s.tab);
  const open = useApp((s) => s.panelOpen);
  const setTab = useApp((s) => s.setTab);
  const { audio, store } = useRuntime();
  const [folded, setFolded] = useFold('sheetFold');
  const [chatMin] = useFold('chatFold');
  const settings = useSettingsOpen();
  const hud = useHud();
  const bankOpen = useApp((s) => s.game.bankOpen);
  const setPref = useSetPref();
  useHudInset([folded, chatMin, hud.hidden, hud.chatbox, settings, open, tab]);
  // Opening Settings (the gear) must show it, even from the collapsed strip.
  useEffect(() => {
    if (settings) setFolded(false);
  }, [settings]);
  return (
    <>
      <Banner />
      {hud.hidden ? (
        <button
          type="button"
          className="hud-show"
          onClick={() => setPref({ hud: { hidden: false } })}
        >
          Show HUD
        </button>
      ) : (
        <>
          {hud.chatbox ? <ChatBox /> : null}
          {hud.skillTracker ? <SkillTracker /> : null}
          <div className="topright">
            {hud.orbs ? <Orbs /> : null}
            {hud.minimap ? <Minimap /> : null}
          </div>
        </>
      )}
      <AreaBanner />
      <UseHint />
      <DialoguePanel />
      <LevelUpPopup />
      <aside
        className="hud"
        data-open={open}
        data-settings={settings}
        data-hidden={hud.hidden}
        data-bank={bankOpen}
        data-folded={folded}
      >
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!settings && tab === t.id}
              onClick={() => {
                audio.play('uiClick');
                setTab(t.id);
                if (folded) {
                  setFolded(false);
                  // A tap on the already-open tab would toggle the body shut; a tap that expands must show it.
                  if (!store.getState().panelOpen) store.getState().togglePanel();
                }
              }}
            >
              {t.label}
            </button>
          ))}
          <SettingsButton />
          <button
            type="button"
            className="sheet-fold"
            aria-label={folded ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!folded}
            onClick={() => setFolded(!folded)}
          >
            {folded ? '\u25B4' : '\u25BE'}
          </button>
        </nav>
        <div className="hud-body">
          {settings ? <SettingsPanel /> : null}
          {!settings && tab === 'inventory' ? <InventoryPanel /> : null}
          {!settings && tab === 'skills' ? <SkillsPanel /> : null}
        </div>
      </aside>
      <BankPanel />
      <MenuLayer />
    </>
  );
}
