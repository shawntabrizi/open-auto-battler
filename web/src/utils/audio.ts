import { Howl, Howler } from 'howler';

export type SfxName =
  | 'click'
  | 'hover'
  | 'card-select'
  | 'card-deselect'
  | 'coin-clink'
  | 'pitch-burn'
  | 'mana-spend'
  | 'clash-hit'
  | 'damage-taken'
  | 'unit-death'
  | 'ability-trigger'
  | 'battle-start'
  | 'round-win'
  | 'round-lose'
  | 'game-victory'
  | 'game-defeat';

export type MusicTrack = 'menu-ambient' | 'shop-phase' | 'battle-phase';

class AudioManager {
  private sfxCache: Map<string, Howl> = new Map();
  private currentMusic: Howl | null = null;
  private currentMusicTrack: MusicTrack | null = null;
  private unlocked = false;

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    // Resume the global AudioContext if it was suspended (autoplay policy)
    Howler.ctx?.resume?.();
  }

  private getSfx(name: SfxName): Howl {
    const cached = this.sfxCache.get(name);
    if (cached) return cached;

    const howl = new Howl({
      src: [`/audio/sfx/${name}.webm`, `/audio/sfx/${name}.mp3`],
      volume: 0.5,
      preload: true,
    });
    this.sfxCache.set(name, howl);
    return howl;
  }

  playSfx(name: SfxName, volume = 0.5) {
    if (!this.unlocked) return;
    try {
      const sfx = this.getSfx(name);
      sfx.volume(volume);
      sfx.play();
    } catch {
      // Audio file may not exist yet - fail silently
    }
  }

  playMusic(track: MusicTrack, volume = 0.3) {
    if (!this.unlocked) return;
    if (this.currentMusicTrack === track && this.currentMusic?.playing()) return;

    // Crossfade
    const oldMusic = this.currentMusic;
    if (oldMusic) {
      oldMusic.fade(oldMusic.volume(), 0, 800);
      setTimeout(() => oldMusic.stop(), 800);
    }

    const newMusic = new Howl({
      src: [`/audio/music/${track}.webm`, `/audio/music/${track}.mp3`],
      volume: 0,
      loop: true,
      html5: true,
    });

    newMusic.play();
    newMusic.fade(0, volume, 800);

    this.currentMusic = newMusic;
    this.currentMusicTrack = track;
  }

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.fade(this.currentMusic.volume(), 0, 500);
      setTimeout(() => {
        this.currentMusic?.stop();
        this.currentMusic = null;
        this.currentMusicTrack = null;
      }, 500);
    }
  }

  setVolumes(master: number, _sfx: number, music: number, muted: boolean) {
    Howler.mute(muted);
    if (this.currentMusic && !muted) {
      this.currentMusic.volume(master * music);
    }
  }
}

export const audioManager = new AudioManager();
