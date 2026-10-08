import { useSyncExternalStore } from 'react';
import type { DeepPartial, Preferences } from '@core/persistence';
import { useApp } from '@app/ui/context';

/**
 * Phone-only HUD folds. Each is a 3-state pref: 'auto' (default: collapsed on phone, expanded on desktop),
 * or the user's explicit choice. Prefs when `core/persistence` knows the key, else this session only.
 */
export type FoldKey = 'sheetFold' | 'chatFold';
export type FoldMode = 'auto' | 'collapsed' | 'expanded';
export type FoldFlags = Record<FoldKey, FoldMode>;

const PHONE = '(max-width: 767px)';
const session: FoldFlags = { sheetFold: 'auto', chatFold: 'auto' };
const listeners = new Set<() => void>();

const asRecord = (hud: object): Record<string, unknown> => hud as Record<string, unknown>;
const isMode = (v: unknown): v is FoldMode => v === 'auto' || v === 'collapsed' || v === 'expanded';

/** True once the preferences contract carries this key. */
export const persistsFold = (hud: object, key: FoldKey): boolean => isMode(asRecord(hud)[key]);

export function readMode(hud: object, key: FoldKey, local: FoldFlags = session): FoldMode {
  return persistsFold(hud, key) ? (asRecord(hud)[key] as FoldMode) : local[key];
}

/** Collapsed/minimized? 'auto' = collapsed on phone only; an explicit choice always wins. */
export const isFolded = (mode: FoldMode, phone: boolean): boolean =>
  mode === 'auto' ? phone : mode === 'collapsed';

/** Writes to prefs when persisted, otherwise to the session fallback. */
export function applyFold(
  hud: object,
  key: FoldKey,
  folded: boolean,
  io: {
    setPref: (u: DeepPartial<Preferences>) => void;
    setLocal: (key: FoldKey, mode: FoldMode) => void;
  },
): void {
  const mode: FoldMode = folded ? 'collapsed' : 'expanded';
  if (persistsFold(hud, key)) io.setPref({ hud: { [key]: mode } } as DeepPartial<Preferences>);
  else io.setLocal(key, mode);
}

function setLocal(key: FoldKey, mode: FoldMode): void {
  if (session[key] === mode) return;
  session[key] = mode;
  listeners.forEach((l) => l());
}

function usePhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(PHONE).matches,
  );
}

export function useFold(key: FoldKey): [boolean, (folded: boolean) => void] {
  const hud = useApp((s) => s.prefs.hud);
  const setPref = useApp((s) => s.setPref);
  const phone = usePhone();
  const local = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => session[key],
  );
  const mode = persistsFold(hud, key) ? readMode(hud, key) : local;
  return [isFolded(mode, phone), (v) => applyFold(hud, key, v, { setPref, setLocal })];
}
