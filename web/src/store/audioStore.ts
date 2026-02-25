import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { audioManager, SfxName, MusicTrack } from '../utils/audio';

interface AudioState {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  isMuted: boolean;

  setMasterVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  toggleMute: () => void;

  playSfx: (name: SfxName) => void;
  playMusic: (name: MusicTrack) => void;
  stopMusic: () => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      masterVolume: 0.7,
      sfxVolume: 0.8,
      musicVolume: 0.4,
      isMuted: false,

      setMasterVolume: (v) => {
        set({ masterVolume: v });
        const s = get();
        audioManager.setVolumes(v, s.sfxVolume, s.musicVolume, s.isMuted);
      },
      setSfxVolume: (v) => {
        set({ sfxVolume: v });
        const s = get();
        audioManager.setVolumes(s.masterVolume, v, s.musicVolume, s.isMuted);
      },
      setMusicVolume: (v) => {
        set({ musicVolume: v });
        const s = get();
        audioManager.setVolumes(s.masterVolume, s.sfxVolume, v, s.isMuted);
      },
      toggleMute: () => {
        const newMuted = !get().isMuted;
        set({ isMuted: newMuted });
        const s = get();
        audioManager.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume, newMuted);
      },

      playSfx: (name) => {
        const s = get();
        if (s.isMuted) return;
        audioManager.playSfx(name, s.masterVolume * s.sfxVolume);
      },
      playMusic: (name) => {
        const s = get();
        if (s.isMuted) return;
        audioManager.playMusic(name, s.masterVolume * s.musicVolume);
      },
      stopMusic: () => {
        audioManager.stopMusic();
      },
    }),
    {
      name: 'oab-audio-settings',
      partialize: (state) => ({
        masterVolume: state.masterVolume,
        sfxVolume: state.sfxVolume,
        musicVolume: state.musicVolume,
        isMuted: state.isMuted,
      }),
    }
  )
);
