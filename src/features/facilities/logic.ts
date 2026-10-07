import type { Requirement } from '@core/contracts';
import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import { FACILITIES } from './data';
import type {
  FacilityDef,
  FacilityError,
  FacilityIntent,
  FacilityOption,
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
