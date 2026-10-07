import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AppState } from '@app/store';
import type { Runtime } from '@app/runtime';

export const RuntimeContext = createContext<Runtime | null>(null);

export function useRuntime(): Runtime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error('RuntimeContext missing');
  return rt;
}

/** Narrow selector over the app store, so a tick only re-renders what it changed. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useRuntime().store, selector);
}
