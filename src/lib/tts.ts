import type { Lang, Scene } from './types';
import { cueName } from './screenplay';

export interface TTSState {
  playing: boolean;
  paused: boolean;
  currentSceneId: string | null;
  currentBlockId: string | null;
  currentSpeaker: string;
}

export type TTSListener = (state: TTSState) => void;

interface VoiceProfile {
  pitch: number;
  rate: number;
  voice: SpeechSynthesisVoice | null;
}

class ScriptReader {
  private queue: { sceneId: string; blockId: string; speaker: string; text: string }[] = [];
  private index = 0;
  private listeners = new Set<TTSListener>();
  private characterProfiles = new Map<string, VoiceProfile>();
  private state: TTSState = {
    playing: false,
    paused: false,
    currentSceneId: null,
    currentBlockId: null,
    currentSpeaker: '',
  };
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null;

  subscribe(listener: TTSListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const l of this.listeners) l({ ...this.state });
  }

  private getVoiceProfile(speaker: string, lang: Lang): VoiceProfile {
    if (this.characterProfiles.has(speaker)) {
      return this.characterProfiles.get(speaker)!;
    }

    const voices = this.synth?.getVoices() ?? [];
    const langCode = lang === 'ml' ? 'ml' : lang === 'ta' ? 'ta' : lang === 'te' ? 'te' : lang === 'kn' ? 'kn' : 'en';
    const langVoice = voices.find((v) => v.lang.toLowerCase().startsWith(langCode)) ??
      voices.find((v) => v.lang.toLowerCase().includes('in')) ??
      null;

    // Deterministically assign pitch and rate based on speaker name hash
    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = (hash << 5) - hash + speaker.charCodeAt(i);
      hash |= 0;
    }
    const abs = Math.abs(hash);

    let pitch = 1.0;
    let rate = 1.0;

    if (speaker === 'Action / Heading') {
      pitch = 0.95;
      rate = 0.95;
    } else {
      // range 0.75 to 1.35 for distinct character acting voices
      pitch = 0.75 + (abs % 7) * 0.1;
      rate = 0.95 + ((abs >> 3) % 4) * 0.05;
    }

    const profile: VoiceProfile = { pitch, rate, voice: langVoice };
    this.characterProfiles.set(speaker, profile);
    return profile;
  }

  playScene(scene: Scene, lang: Lang) {
    this.stop();
    this.queue = [];

    // Add heading
    if (scene.heading.trim()) {
      this.queue.push({
        sceneId: scene.id,
        blockId: 'h-' + scene.id,
        speaker: 'Action / Heading',
        text: scene.heading,
      });
    }

    let lastChar = '';
    for (const b of scene.blocks) {
      if (b.type === 'character') {
        lastChar = cueName(b.text);
      } else if (b.type === 'dialogue' && b.text.trim()) {
        this.queue.push({
          sceneId: scene.id,
          blockId: b.id,
          speaker: lastChar || 'Speaker',
          text: b.text,
        });
      } else if (b.type === 'action' && b.text.trim()) {
        this.queue.push({
          sceneId: scene.id,
          blockId: b.id,
          speaker: 'Action / Heading',
          text: b.text,
        });
        lastChar = '';
      }
    }

    if (!this.queue.length) return;
    this.index = 0;
    this.state.playing = true;
    this.state.paused = false;
    this.speakCurrent(lang);
  }

  private speakCurrent(lang: Lang) {
    if (!this.synth || this.index >= this.queue.length) {
      this.stop();
      return;
    }

    const item = this.queue[this.index];
    this.state.currentSceneId = item.sceneId;
    this.state.currentBlockId = item.blockId;
    this.state.currentSpeaker = item.speaker;
    this.notify();

    const profile = this.getVoiceProfile(item.speaker, lang);
    const u = new SpeechSynthesisUtterance(item.text);
    if (profile.voice) u.voice = profile.voice;
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    u.lang = lang === 'ml' ? 'ml-IN' : lang === 'ta' ? 'ta-IN' : lang === 'te' ? 'te-IN' : lang === 'kn' ? 'kn-IN' : 'en-IN';

    u.onend = () => {
      if (!this.state.playing) return;
      this.index++;
      this.speakCurrent(lang);
    };

    u.onerror = () => {
      if (!this.state.playing) return;
      this.index++;
      this.speakCurrent(lang);
    };

    this.synth.speak(u);
  }

  pause() {
    if (this.synth && this.state.playing && !this.state.paused) {
      this.synth.pause();
      this.state.paused = true;
      this.notify();
    }
  }

  resume() {
    if (this.synth && this.state.playing && this.state.paused) {
      this.synth.resume();
      this.state.paused = false;
      this.notify();
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.state = {
      playing: false,
      paused: false,
      currentSceneId: null,
      currentBlockId: null,
      currentSpeaker: '',
    };
    this.queue = [];
    this.index = 0;
    this.notify();
  }
}

export const scriptReader = new ScriptReader();
