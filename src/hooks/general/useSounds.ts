import { useCallback } from 'react';
import { soundManager } from '@/utils/soundMgr';
import { SoundType } from '@/types/soundTypes';

export function useSounds() {
  const playSound = useCallback((soundType: SoundType, config = {}) => {
    try {
      soundManager.play(soundType, config);
    } catch (error) {
      console.warn(`Error in playSound for ${soundType}:`, error);
    }
  }, []);

  const toggleMute = useCallback(() => {
    try {
      soundManager.toggleMute();
    } catch (error) {
      console.warn('Error in toggleMute:', error);
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    try {
      soundManager.setMasterVolume(volume);
    } catch (error) {
      console.warn('Error in setVolume:', error);
    }
  }, []);

  return {
    playSound,
    toggleMute,
    setVolume
  };
}