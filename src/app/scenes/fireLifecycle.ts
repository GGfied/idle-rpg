/**
 * Fire view lifecycle (pure, no Phaser): one view + one flicker entry per fire in the game state.
 * Created when the fire appears, `dying` for the last 10% of its burn, flicker removed BEFORE the view is destroyed.
 */
import type { FlameTarget } from '@render/animation';
import type { FireState } from '@features/facilities';

/** The fire is "dying" once this share of its burn (or less) is left. */
export const DYING_SHARE = 0.1;

export interface FireViewLike {
  readonly flameTarget: FlameTarget;
  setDying(dying: boolean): void;
  destroy(): void;
}

export interface FlickerLike {
  add(id: string, target: FlameTarget): void;
  setDying(id: string, dying: boolean): void;
  remove(id: string): void;
}

/** Is this fire in the last 10% of its burn at `tick`? (`burnTicks` = the fire's total burn time.) */
export function isDying(
  fire: Pick<FireState, 'expiresAtTick'>,
  tick: number,
  burnTicks: number,
): boolean {
  return burnTicks > 0 && fire.expiresAtTick - tick <= burnTicks * DYING_SHARE;
}

/** The unlit log pile shown on the target tile while lighting. */
export interface PileViewLike {
  destroy(): void;
}

/** What `sync` needs of the lighting action: the target tile and the logs being lit (null = not lighting). */
export interface LightingLike {
  readonly tile: { x: number; y: number };
  readonly logsId: string;
}

export interface FireLifecycle {
  /**
   * Make the views match the fires and the dying state match `tick`; show a log pile on the lighting tile while
   * `lighting` is set (swapped for the fire in the same call when it lights). Cheap to call every store change.
   */
  sync(fires: readonly FireState[], tick: number, lighting?: LightingLike | null): void;
  destroy(): void;
  count(): number;
}

export function createFireLifecycle<V extends FireViewLike>(
  make: (tile: { x: number; y: number }) => V,
  flicker: FlickerLike,
  burnTicksOf: (logsId: string) => number | undefined,
  makePile?: (tile: { x: number; y: number }, logsId: string) => PileViewLike,
): FireLifecycle {
  let pile: { view: PileViewLike; key: string } | null = null;
  const dropPile = (): void => {
    pile?.view.destroy();
    pile = null;
  };
  const views = new Map<string, { view: V; dying: boolean }>();
  const drop = (id: string): void => {
    const e = views.get(id);
    if (!e) return;
    flicker.remove(id);
    e.view.destroy();
    views.delete(id);
  };
  return {
    sync(fires, tick, lighting = null) {
      const live = new Set(fires.map((f) => f.id));
      for (const id of [...views.keys()]) if (!live.has(id)) drop(id);
      for (const f of fires) {
        let e = views.get(f.id);
        if (!e) {
          e = { view: make(f.tile), dying: false };
          views.set(f.id, e);
          flicker.add(f.id, e.view.flameTarget);
        }
        const dying = isDying(f, tick, burnTicksOf(f.logsId) ?? 0);
        if (dying !== e.dying) {
          e.dying = dying;
          e.view.setDying(dying);
          flicker.setDying(f.id, dying);
        }
      }
      // After the fires, so the pile goes in the same call the fire appears (no frame with both or neither).
      const key = lighting ? `${lighting.tile.x},${lighting.tile.y},${lighting.logsId}` : '';
      if (pile && pile.key !== key) dropPile();
      if (!pile && lighting && makePile)
        pile = { view: makePile(lighting.tile, lighting.logsId), key };
    },
    destroy() {
      dropPile();
      for (const id of [...views.keys()]) drop(id);
    },
    count: () => views.size,
  };
}
