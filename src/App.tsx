import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RockyHologram, type RockyState } from './rocky/hologram';
import { RockyAudio, LANG_OPTIONS, type LangCode } from './rocky/audio';
import { localReply, connectedReply, planTask, type AiSettings, type ChatMessage, type UserProfile, DEFAULT_PROFILE } from './rocky/brain';
import { TaskStore, needsConfirmation } from './rocky/tasks';
import { Preferences } from '@capacitor/preferences';
import { App as CapApp } from '@capacitor/app';

const store = new TaskStore();
const audio = new RockyAudio();

function loadLocal<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : fallback; } catch { return fallback; }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holoRef = useRef<RockyHologram | null>(null);
  const [state, setState] = useState<RockyState>('IDLE');
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadLocal('rocky-chat-v1', []));
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [wave, setWave] = useState<number[]>(Array.from({ length: 32 }, () => 2));
  const [drawer, setDrawer] = useState<'settings' | 'tasks' | null>(null);
  const [lang, setLang] = useState<LangCode>(() => loadLocal('rocky-lang', 'auto'));
  const [rate, setRate] = useState(() => loadLocal('rocky-rate', 1));
  const [pitch, setPitch] = useState(() => loadLocal('rocky-pitch', 0.78));
  const [volume, setVolume] = useState(() => loadLocal('rocky-volume', 1));
  const [muted, setMuted] = useState(false);
  const [lowQuality, setLowQuality] = useState(() => loadLocal('rocky-lowq', false));
  const [profile, setProfile] = useState<UserProfile>(() => loadLocal('rocky-profile', DEFAULT_PROFILE));
  const [ai, setAi] = useState<AiSettings>({ mode: 'offline', baseUrl: '', model: '', apiKey: '' });
  const [fileName, setFileName] = useState('notes.txt');
  const [fileContent, setFileContent] = useState('');
  const [filesTick, setFilesTick] = useState(0);
  const [confirm, setConfirm] = useState<{ action: string; run: () => void } | null>(null);
  const [proposed, setProposed] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopSpeakRef = useRef<(() => void) | null>(null);

  const modeLabel = ai.mode === 'connected' && ai.apiKey ? 'Connected' : 'Offline';
  const files = useMemo(() => store.listFiles(), [filesTick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isMobile = window.innerWidth < 768 || /Android|iPhone/i.test(navigator.userAgent);
    const h = new RockyHologram(canvas, { isMobile, lowQuality });
    holoRef.current = h;
    const onLow = () => setLowQuality(true);
    window.addEventListener('rocky-low-fps', onLow);
    // restore on-device AI settings (key never leaves the device)
    Preferences.get({ key: 'rocky-ai-settings' }).then(({ value }) => {
      if (value) { try { setAi(JSON.parse(value)); } catch { /* ignore */ } }
    }).catch(() => undefined);
    const resumed = store.resumeInterrupted();
    if (resumed > 0) setFilesTick((t) => t + 1);
    // Android back button: close drawer first, else let system handle it
    let listener: any;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (drawer) setDrawer(null);
      else if (!canGoBack) CapApp.exitApp().catch(() => undefined);
    }).then((l) => { listener = l; });
    return () => { h.dispose(); window.removeEventListener('rocky-low-fps', onLow); listener?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { holoRef.current?.setState(state); }, [state]);
  useEffect(() => { holoRef.current?.setLowQuality(lowQuality); localStorage.setItem('rocky-lowq', JSON.stringify(lowQuality)); }, [lowQuality]);
  useEffect(() => { localStorage.setItem('rocky-chat-v1', JSON.stringify(messages.slice(-100))); }, [messages]);
  useEffect(() => { localStorage.setItem('rocky-profile', JSON.stringify(profile)); }, [profile]);

  // amplitude loop: real mic RMS while listening, TTS envelope while speaking
  useEffect(() => {
    const id = setInterval(() => {
      if (state === 'LISTENING') {
        const rms = audio.rms();
        holoRef.current?.setAmplitude(rms);
        setWave(Array.from({ length: 32 }, (_, i) => 2 + rms * 26 * (0.5 + 0.5 * Math.sin(i * 0.9 + Date.now() / 130))));
      } else if (state !== 'SPEAKING') {
        holoRef.current?.setAmplitude(0.06);
        setWave(Array.from({ length: 32 }, () => 2));
      }
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  const speak = useCallback((text: string) => {
    if (muted) { setState('IDLE'); return; }
    setState('SPEAKING');
    stopSpeakRef.current = audio.speak(text, { rate, pitch, volume },
      (a) => { holoRef.current?.setAmplitude(a); setWave(Array.from({ length: 32 }, (_, i) => 2 + a * 22 * (0.5 + 0.5 * Math.sin(i * 0.8)))); },
      () => setState('IDLE'));
  }, [muted, rate, pitch, volume]);

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: ChatMessage = { role: 'user', text: clean, at: Date.now(), mode: ai.mode };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    // local profile learning (explicit "my name is ..." only)
    const nameMatch = clean.match(/(?:my name is|je m'appelle)\s+([A-Za-zÀ-ÿ' -]+)/i);
    if (nameMatch) setProfile((p) => ({ ...p, name: nameMatch[1].trim() }));

    if (clean.toLowerCase().startsWith('plan:') || clean.toLowerCase().startsWith('plan ')) {
      setState('EXECUTING');
      const steps = planTask(clean.replace(/^plan:?\s*/i, ''));
      const task = store.addTask(clean);
      setFilesTick((t) => t + 1);
      store.setTask(task.id, 'done', steps.join(' | '));
      setProposed(`PROPOSED PLAN (not yet executed as files):\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
      setFilesTick((t) => t + 1);
      const reply = `Plan ready — ${steps.length} steps. See the proposal above; nothing was deleted or sent.`;
      setMessages((m) => [...m, { role: 'rocky', text: reply, at: Date.now(), mode: ai.mode }]);
      speak(reply);
      return;
    }

    const connected = ai.mode === 'connected' && !!ai.apiKey && !!ai.baseUrl && !!ai.model;
    if (!connected) {
      const reply = localReply(clean, profile);
      setMessages((m) => [...m, { role: 'rocky', text: reply, at: Date.now(), mode: 'offline' }]);
      speak(reply);
      return;
    }
    setState('THINKING');
    abortRef.current = new AbortController();
    try {
      let streamed = '';
      const full = await connectedReply([...messages, userMsg], ai, abortRef.current.signal, (tok) => {
        streamed += tok;
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === 'rocky' && last.text === streamed.slice(0, -tok.length)) return [...m.slice(0, -1), { ...last, text: streamed }];
          return [...m, { role: 'rocky', text: streamed, at: Date.now(), mode: 'connected' }];
        });
      });
      const finalText = full || streamed;
      setMessages((m) => {
        const last = m[m.length - 1];
        return last?.role === 'rocky' ? [...m.slice(0, -1), { ...last, text: finalText }] : [...m, { role: 'rocky', text: finalText, at: Date.now(), mode: 'connected' }];
      });
      speak(finalText);
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Cancelled.' : `Model error: ${e?.message || 'unknown'}. Check Settings — your key stays on this device only.`;
      setState('ERROR');
      setMessages((m) => [...m, { role: 'rocky', text: msg, at: Date.now(), mode: 'connected' }]);
      setTimeout(() => setState('IDLE'), 2000);
    }
  }, [ai, messages, profile, speak]);

  const toggleMic = async () => {
    if (listening) { audio.stopRecognition(); audio.stopMic(); setListening(false); setState('IDLE'); return; }
    setMicError('');
    try {
      await audio.startMic();
      setListening(true);
      setState('LISTENING');
      audio.startRecognition(lang, (text, final) => {
        setInput(text);
        if (final && text.trim()) { audio.stopRecognition(); audio.stopMic(); setListening(false); void send(text); }
      }, (err) => { setMicError(err); setState('ERROR'); setListening(false); audio.stopMic(); setTimeout(() => setState('IDLE'), 2500); });
    } catch (e: any) {
      setMicError(`Microphone permission denied or unavailable: ${e?.message || 'unknown'}. Allow microphone permission in Android Settings > Apps > ROCKY AI > Permissions, then try again.`);
      setState('ERROR');
      setTimeout(() => setState('IDLE'), 3000);
    }
  };

  const stopAll = () => {
    audio.stopSpeaking(); audio.stopRecognition(); audio.stopMic();
    abortRef.current?.abort();
    setListening(false); setState('IDLE');
  };

  const saveAi = async () => {
    await Preferences.set({ key: 'rocky-ai-settings', value: JSON.stringify(ai) }).catch(() => undefined);
    setDrawer(null);
  };

  const doDeleteFile = (name: string) => setConfirm({ action: `delete file "${name}"`, run: () => { store.deleteFile(name); setFilesTick((t) => t + 1); setConfirm(null); } });

  return (
    <div className="app">
      <header>
        <div className="logo">ROCKY <span>AI</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => setDrawer(drawer === 'tasks' ? null : 'tasks')}>Tasks</button>
          <button className="secondary" onClick={() => setDrawer(drawer === 'settings' ? null : 'settings')}>Settings</button>
        </div>
      </header>
      <div className="modebar">
        Mode: <b className={modeLabel === 'Offline' ? 'offline' : 'connected'}>{modeLabel === 'Offline' ? 'OFFLINE (local brain — no cloud model)' : 'CONNECTED (your endpoint)'}</b>
        <span style={{ marginLeft: 'auto' }}><span className="pill">{state}</span></span>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} />
        <div className="wave">{wave.map((h, i) => <i key={i} style={{ height: h }} />)}</div>
      </div>
      {micError && <div className="notice">{micError}</div>}
      {proposed && (
        <div style={{ padding: '0 14px 6px' }}>
          <div className="file" style={{ borderStyle: 'dashed' }}>
            <b>Proposed action — NOT executed yet</b>
            <pre>{proposed}</pre>
            <div className="row"><button onClick={() => setProposed(null)}>Dismiss proposal</button></div>
          </div>
        </div>
      )}
      <div className="transcript">
        {messages.length === 0 && <div className="msg rocky"><div className="meta">ROCKY · OFFLINE</div>Rocky is online. Tap the mic and speak, or type below. Try: “plan: build a landing page”.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'rocky'}`}>
            <div className="meta">{m.role === 'user' ? 'YOU' : `ROCKY · ${m.mode.toUpperCase()}`}</div>{m.text}
          </div>
        ))}
      </div>
      <div className="controls">
        <button className={`mic ${listening ? 'live' : ''}`} onClick={toggleMic} aria-label="Microphone">{listening ? '■' : '🎤'}</button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Talk to ROCKY…" onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }} />
        <button onClick={() => void send(input)}>Send</button>
        <button className="secondary" onClick={stopAll}>Stop</button>
        <button className="secondary" onClick={() => { const m = !muted; setMuted(m); audio.muted = m; if (m) audio.stopSpeaking(); }}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>

      {drawer === 'settings' && (
        <div className="drawer">
          <div className="row"><b>Settings</b><button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDrawer(null)}>Close</button></div>
          <label>Language (speech recognition)</label>
          <select value={lang} onChange={(e) => { const v = e.target.value as LangCode; setLang(v); localStorage.setItem('rocky-lang', JSON.stringify(v)); }}>
            {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          <label>Your name (remembered on-device)</label>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Oussama" />
          <label>Voice rate: {rate.toFixed(2)}</label>
          <input type="range" min="0.7" max="1.3" step="0.05" value={rate} onChange={(e) => { setRate(+e.target.value); localStorage.setItem('rocky-rate', JSON.stringify(+e.target.value)); }} />
          <label>Voice pitch (lower = deeper): {pitch.toFixed(2)}</label>
          <input type="range" min="0.5" max="1.2" step="0.01" value={pitch} onChange={(e) => { setPitch(+e.target.value); localStorage.setItem('rocky-pitch', JSON.stringify(+e.target.value)); }} />
          <label>Volume: {volume.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { setVolume(+e.target.value); localStorage.setItem('rocky-volume', JSON.stringify(+e.target.value)); }} />
          <label><input type="checkbox" checked={lowQuality} onChange={(e) => setLowQuality(e.target.checked)} /> Low-quality particles (weaker devices)</label>
          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>AI model (optional, on-device only)</b>
          <p style={{ fontSize: 13, opacity: 0.8 }}>Your key is stored only in this app on this phone. It is never bundled into the app, never committed to GitHub, never logged. Leave empty to stay offline.</p>
          <label>Mode</label>
          <select value={ai.mode} onChange={(e) => setAi({ ...ai, mode: e.target.value as 'offline' | 'connected' })}>
            <option value="offline">Offline local brain</option><option value="connected">Connected (OpenAI-compatible endpoint)</option>
          </select>
          <label>Base URL</label>
          <input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
          <label>Model</label>
          <input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
          <label>API key (on-device only)</label>
          <input type="password" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} placeholder="••••••••" />
          <div className="row" style={{ marginTop: 12 }}><button onClick={saveAi}>Save settings</button><button className="secondary" onClick={() => setDrawer(null)}>Cancel</button></div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Speech recognition for ar-DZ / fr-FR / en-US is NOT verified on a real device yet — test on your phone and report what actually works.</p>
        </div>
      )}

      {drawer === 'tasks' && (
        <div className="drawer">
          <div className="row"><b>Tasks &amp; Files</b><button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDrawer(null)}>Close</button></div>
          <label>File name</label>
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} />
          <label>Content</label>
          <textarea rows={5} value={fileContent} onChange={(e) => setFileContent(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => { store.createFile(fileName, fileContent); setFilesTick((t) => t + 1); }}>Create / Update file</button>
            <button className="secondary" onClick={() => { const t = store.addTask(`File: ${fileName}`); store.setTask(t.id, 'done', 'Saved in-app file store'); setFilesTick((t2) => t2 + 1); }}>Log task</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Files live in this app's store on your phone. The app cannot access arbitrary phone files — Android sandbox rules apply.</p>
          {files.map((f) => (
            <div className="file" key={f.name}>
              <div className="row"><b>{f.name}</b><button className="danger" style={{ marginLeft: 'auto' }} onClick={() => { if (needsConfirmation('delete')) doDeleteFile(f.name); }}>Delete</button></div>
              <pre>{f.content}</pre>
            </div>
          ))}
          {store.tasks.map((t) => (
            <div className="file" key={t.id}><b>{t.title}</b> — {t.status}<div style={{ fontSize: 12, opacity: 0.8 }}>{t.detail}</div></div>
          ))}
        </div>
      )}

      {confirm && (
        <div className="modal-bg"><div className="modal">
          <h3 style={{ marginTop: 0 }}>Confirm destructive action</h3>
          <p>Are you sure you want to {confirm.action}? This cannot be undone from inside ROCKY.</p>
          <div className="row"><button className="danger" onClick={confirm.run}>Yes, do it</button><button className="secondary" onClick={() => setConfirm(null)}>Cancel</button></div>
        </div></div>
      )}
    </div>
  );
}
