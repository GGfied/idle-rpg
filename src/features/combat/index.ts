export {
  createPlayerHp,
  damage,
  deserializePlayerHp,
  heal,
  isDead,
  serializePlayerHp,
  tickPlayerHp,
} from './logic';
export { HP_BOOST_CAP, HP_REGEN_INTERVAL_TICKS } from './data';
export type { CombatEvent, HpChangedEvent, PlayerHpState } from './types';
