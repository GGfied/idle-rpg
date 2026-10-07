import type { DeepPartial, Preferences } from '@core/persistence';
import { useApp } from '@app/ui/context';

export const useHud = (): Preferences['hud'] => useApp((s) => s.prefs.hud);
export const useNotifications = (): Preferences['notifications'] =>
  useApp((s) => s.prefs.notifications);
export const useVisuals = (): Preferences['visuals'] => useApp((s) => s.prefs.visuals);
export const useSetPref = (): ((update: DeepPartial<Preferences>) => void) =>
  useApp((s) => s.setPref);
