// src/types/soundTypes.ts
export type SoundType = 
  | 'resourceGather'
  | 'combatAttack'
  | 'combatHit'
  | 'levelUp'
  | 'upgrade'
  | 'craft'
  | 'buttonClick';

export interface SoundConfig {
  volume?: number;
  loop?: boolean;
}

export interface SoundManager {
  play: (soundType: SoundType, config?: SoundConfig) => void;
  setMasterVolume: (volume: number) => void;
  toggleMute: () => void;
}