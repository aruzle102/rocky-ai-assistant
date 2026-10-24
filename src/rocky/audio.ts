/** Real audio: mic analyser (real RMS), Web Speech recognition + TTS.
 * Honesty note: Web Speech TTS exposes no raw audio stream, so SPEAKING
 * visuals use a timing envelope from the utterance, while LISTENING visuals
 * use the real microphone analyser. See README. */

export type LangCode = 'auto' | 'ar-DZ' | 'ar-SA' | 'fr-FR' | 'en-US';

export const LANG_OPTIONS: { code: LangCode; label: string; recog: string }[] = [
  { code: 'auto', label: 'Auto (device language)', recog: '' },
  { code: 'ar-DZ', label: 'Arabic — Algeria (ar-DZ)', recog: 'ar-DZ' },
  { code: 'ar-SA', label: 'Arabic — Saudi (ar-SA fallback)', recog: 'ar-SA' },
  { code: 'fr-FR', label: 'French (fr-FR)', recog: 'fr-FR' },
  { code: 'en-US', label: 'English (en-US)', recog: 'en-US' },
];

export function pickMaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const maleHints = ['male', 'david', 'guy', 'daniel', 'aaron', 'james', 'microsoft guy', 'google uk english male'];
  const lower = (v: SpeechSynthesisVoice) => v.name.toLowerCase();
  return (
    voices.find((v) => maleHints.some((h) => lower(v).includes(h))) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0]
  );
}

export class RockyAudio {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private recog: any = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  muted = false;

  get supported() {
    return {
      mic: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      recog: typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
      tts: typeof window !== 'undefined' && !!window.speechSynthesis,
    };
  }

  async startMic(): Promise<void> {
    if (!this.supported.mic) throw new Error('Microphone is not available on this device/browser.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Real RMS amplitude 0..1 from the live microphone analyser. */
  rms(): number {
    if (!this.analyser || !this.data) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 4);
  }

  stopMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null; this.analyser = null;
  }

  startRecognition(lang: LangCode, onResult: (text: string, final: boolean) => void, onError: (msg: string) => void) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) { onError('Speech recognition is not supported on this device. Type your message instead.'); return; }
    try { this.recog?.abort(); } catch { /* noop */ }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    const opt = LANG_OPTIONS.find((o) => o.code === lang);
    rec.lang = opt?.recog || navigator.language || 'en-US';
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onResult(text, !!e.results[e.results.length - 1]?.isFinal);
    };
    rec.onerror = (e: any) => onError(`Speech recognition error: ${e.error || 'unknown'}. Check microphone permission and try again.`);
    rec.start();
    this.recog = rec;
  }

  stopRecognition() { try { this.recog?.stop(); } catch { /* noop */ } }

  getVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  /** Speak with a deep male voice where available. Returns a stop function.
   *  onEnvelope receives a synthetic 0..1 envelope (TTS timing, NOT raw audio). */
  speak(text: string, opts: { rate: number; pitch: number; volume: number }, onEnvelope: (a: number) => void, onEnd: () => void): () => void {
    if (!window.speechSynthesis) { onEnd(); return () => undefined; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const voice = pickMaleVoice(this.getVoices());
    if (voice) utt.voice = voice;
    utt.rate = opts.rate;
    utt.pitch = Math.max(0, Math.min(2, opts.pitch)); // default UI range 0.7–0.85 = deep voice
    utt.volume = this.muted ? 0 : opts.volume;
    const words = Math.max(1, text.split(/\s+/).length);
    const durMs = (words / (opts.rate * 2.6)) * 1000 + 400;
    const started = Date.now();
    this.speakingTimer = setInterval(() => {
      const p = (Date.now() - started) / durMs;
      if (p >= 1) { onEnvelope(0); return; }
      // syllable-like envelope: smooth pulses, fades in/out
      onEnvelope(0.35 + 0.45 * Math.abs(Math.sin(p * Math.PI * words * 0.9)) * (1 - p * 0.3));
    }, 90);
    utt.onend = () => { this.clearSpeakTimer(); onEnvelope(0); onEnd(); };
    utt.onerror = () => { this.clearSpeakTimer(); onEnvelope(0); onEnd(); };
    window.speechSynthesis.speak(utt);
    return () => this.stopSpeaking();
  }

  stopSpeaking() {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    this.clearSpeakTimer();
  }

  private clearSpeakTimer() {
    if (this.speakingTimer) clearInterval(this.speakingTimer);
    this.speakingTimer = null;
  }
}
