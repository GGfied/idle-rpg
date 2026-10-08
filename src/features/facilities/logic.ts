import type { Requirement } from '@core/contracts';
import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import type { Tile } from '@core/contracts';
import { ASHES_ID, FACILITIES, LIGHTABLE_LOGS } from './data';
import type {
  FacilityDef,
  FacilityError,
  FacilityIntent,
  FacilityOption,
  FireDrop,
  FireEvent,
  FireState,
  LightError,
  LightInput,
  LightOutcome,
  LightableLogDef,
  ReachRule,
} from './types';

type Table = readonly FacilityDef[];

export function facilityDef(kind: string, table: Table = FACILITIES): FacilityDef | undefined {
  return table.find((f) => f.kind === kind);
}

function findOption(def: FacilityDef | undefined, optionId?: string): FacilityOption | undefined {
  return optionId === undefined ? def?.options[0] : def?.options.find((o) => o.id === optionId);
}

/** Options in menu order (the first is the default left-click action). */
export function optionsFor(kind: string, table: Table = FACILITIES): readonly FacilityOption[] {
  return facilityDef(kind, table)?.options ?? [];
}

/** The intent for an option; with no optionId, the default (first) option. */
export function interactionFor(
  kind: string,
  optionId?: string,
  table: Table = FACILITIES,
): Result<FacilityIntent, FacilityError> {
  const def = facilityDef(kind, table);
  if (!def) return err('unknownFacility');
  const opt = findOption(def, optionId);
  return opt ? ok(opt.intent) : err('unknownOption');
}

/** Requirements to use an option (empty = none). The caller checks them against its own state. */
export function requirementsFor(
  kind: string,
  optionId?: string,
  table: Table = FACILITIES,
): readonly Requirement[] {
  return findOption(facilityDef(kind, table), optionId)?.requires ?? [];
}

export function reachRuleFor(kind: string, table: Table = FACILITIES): ReachRule | undefined {
  return facilityDef(kind, table)?.reach;
}

export function fireAt(fires: readonly FireState[], tile: Tile): FireState | undefined {
  return fires.find((f) => f.tile.x === tile.x && f.tile.y === tile.y);
}

/** Light logs into a fire. Pure: returns the new list and the item to consume. */
export function lightFire(
  fires: readonly FireState[],
  input: LightInput,
  logs: Readonly<Record<string, LightableLogDef>> = LIGHTABLE_LOGS,
): Result<LightOutcome, LightError> {
  if (!input.hasTinderbox) return err('noTinderbox');
  const def = Object.hasOwn(logs, input.logsId) ? logs[input.logsId] : undefined;
  if (!def) return err('notLightable');
  if (input.tileBlocked || fireAt(fires, input.tile)) return err('tileOccupied');
  const fire: FireState = {
    id: input.nextId,
    tile: { x: input.tile.x, y: input.tile.y },
    logsId: input.logsId,
    expiresAtTick: input.nowTick + def.burnTicks,
  };
  return ok({ fires: [...fires, fire], fire, consumed: { itemId: input.logsId, quantity: 1 } });
}

/** Remove fires whose time is up (expiresAtTick <= nowTick); each emits `fireBurnedOut` plus an ashes drop. */
export function tickFires(
  fires: readonly FireState[],
  nowTick: number,
): { fires: FireState[]; events: FireEvent[]; drops: FireDrop[] } {
  const live: FireState[] = [];
  const events: FireEvent[] = [];
  const drops: FireDrop[] = [];
  for (const f of fires) {
    if (f.expiresAtTick <= nowTick) {
      events.push({ type: 'fireBurnedOut', fireId: f.id, tile: f.tile, logsId: f.logsId });
      drops.push({ itemId: ASHES_ID, quantity: 1, tile: { x: f.tile.x, y: f.tile.y } });
    } else live.push(f);
  }
  return { fires: live, events, drops };
}
