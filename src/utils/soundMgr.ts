// soundMgr.ts
class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterVolume = 0.5;
  private isMuted = false;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('AudioContext initialization failed:', error);
    }
  }

  private createOscillator(frequency: number, duration: number): OscillatorNode {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    return oscillator;
  }

  play(soundType: string) {
    if (!this.audioContext || this.isMuted) return;

    try {
      let oscillator: OscillatorNode;
      const duration = 0.2;

      switch (soundType) {
        case 'resourceGather':
          oscillator = this.createOscillator(440, duration);
          break;
        case 'combatAttack':
          oscillator = this.createOscillator(220, duration);
          break;
        case 'combatHit':
          oscillator = this.createOscillator(110, duration);
          break;
        case 'levelUp':
          oscillator = this.createOscillator(880, duration);
          break;
        case 'upgrade':
          oscillator = this.createOscillator(660, duration);
          break;
        case 'craft':
          oscillator = this.createOscillator(550, duration);
          break;
        default:
          oscillator = this.createOscillator(330, duration);
      }

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Error playing sound:', error);
    }
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
  }
}

export const soundManager = new SoundManager();