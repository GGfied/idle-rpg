import type { FacilityDef } from './types';

export const FACILITIES: FacilityDef[] = [
  {
    kind: 'bank_booth',
    name: 'Bank booth',
    examine: 'A sturdy booth where the banker keeps your belongings safe.',
    reach: 'adjacent4',
    options: [{ id: 'bank', label: 'Bank', intent: { type: 'openPanel', panel: 'bankPanel' } }],
  },
  {
    kind: 'bank_chest',
    name: 'Bank chest',
    examine: 'An iron-bound chest that stores your items.',
    reach: 'adjacent4',
    options: [{ id: 'use', label: 'Use', intent: { type: 'openPanel', panel: 'bankPanel' } }],
  },
  {
    kind: 'deposit_chest',
    name: 'Deposit chest',
    examine: 'A slotted chest that accepts deposits. Nothing comes back out.',
    reach: 'adjacent4',
    options: [
      { id: 'deposit', label: 'Deposit', intent: { type: 'openPanel', panel: 'depositPanel' } },
    ],
  },
];
