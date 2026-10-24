import { useCallback, useEffect, useRef, useState } from 'react';
import { RockyHologram, type RockyState } from './rocky/hologram';
import { RockyAudio, LANG_OPTIONS, type LangCode } from './rocky/audio';
import { localReply, connectedReply, freeReply, planTask, parseLocalCommand, type AiSettings, type ChatMessage, type UserProfile, type ReplyLang, TTS_LANG, DEFAULT_PROFILE } from './rocky/brain';
import { TaskStore, needsConfirmation, isUnsupportedAction } from './rocky/tasks';
import { RockySfx } from './rocky/sfx';
import { Preferences } from '@capacitor/preferences';
import { App as CapApp } from '@capacitor/app';

const store = new TaskStore();
const audio = new RockyAudio();
const sfx = new RockySfx();

function loadLocal<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : fallback; } catch { return fallback; }
}

type UIKey = 'settings' | 'tasks' | 'send' | 'stop' | 'mute' | 'unmute' | 'close' | 'save' | 'cancel' | 'placeholder' | 'tasksFiles' | 'fileName' | 'content' | 'createFile' | 'replyLanguage' | 'voice' | 'testVoice' | 'rate' | 'pitch' | 'volume' | 'sfx' | 'quality' | 'lowQuality' | 'privacy' | 'clearConversation' | 'clearMemory' | 'exportHistory' | 'introReplay' | 'aiProvider' | 'nameLabel' | 'notesLabel' | 'runPlan' | 'dismiss' | 'thinking' | 'unsupportedNote';
const UI: Record<ReplyLang, Record<UIKey, string>> = {
  en: { settings: 'Settings', tasks: 'Tasks', send: 'Send', stop: 'Stop', mute: 'Mute', unmute: 'Unmute', close: 'Close', save: 'Save settings', cancel: 'Cancel', placeholder: 'Talk to ROCKY…', tasksFiles: 'Tasks & Files', fileName: 'File name', content: 'Content', createFile: 'Create / Update file', replyLanguage: 'Reply language', voice: 'Voice (device voices)', testVoice: 'Test voice', rate: 'Voice rate', pitch: 'Voice pitch (lower = deeper)', volume: 'Volume', sfx: 'Sound effects', quality: 'Particle quality', lowQuality: 'Low-quality particles (weaker devices)', privacy: 'Privacy', clearConversation: 'Clear conversation', clearMemory: 'Clear memory (name & notes)', exportHistory: 'Export history as text', introReplay: 'Replay intro', aiProvider: 'AI provider', nameLabel: 'Your name (remembered on-device)', notesLabel: 'Notes (remembered on-device, editable)', runPlan: 'Run plan', dismiss: 'Dismiss', thinking: 'ROCKY is thinking…', unsupportedNote: 'Files live in this app’s store on your phone. The app cannot access arbitrary phone files, send messages, make calls, or buy things — Android sandbox rules apply.' },
  fr: { settings: 'Réglages', tasks: 'Tâches', send: 'Envoyer', stop: 'Arrêter', mute: 'Couper le son', unmute: 'Remettre le son', close: 'Fermer', save: 'Enregistrer', cancel: 'Annuler', placeholder: 'Parlez à ROCKY…', tasksFiles: 'Tâches et fichiers', fileName: 'Nom du fichier', content: 'Contenu', createFile: 'Créer / Mettre à jour le fichier', replyLanguage: 'Langue des réponses', voice: 'Voix (voix de l’appareil)', testVoice: 'Tester la voix', rate: 'Vitesse de la voix', pitch: 'Hauteur de la voix (plus bas = plus grave)', volume: 'Volume', sfx: 'Effets sonores', quality: 'Qualité des particules', lowQuality: 'Particules basse qualité (appareils faibles)', privacy: 'Confidentialité', clearConversation: 'Effacer la conversation', clearMemory: 'Effacer la mémoire (nom et notes)', exportHistory: 'Exporter l’historique en texte', introReplay: 'Rejouer l’intro', aiProvider: 'Fournisseur d’IA', nameLabel: 'Votre nom (retenu sur l’appareil)', notesLabel: 'Notes (retenues sur l’appareil, modifiables)', runPlan: 'Exécuter le plan', dismiss: 'Ignorer', thinking: 'ROCKY réfléchit…', unsupportedNote: 'Les fichiers vivent dans le stockage de cette application sur votre téléphone. L’application ne peut pas accéder aux fichiers du téléphone, envoyer des messages, passer des appels ou acheter — les règles du bac à sable Android s’appliquent.' },
  ar: { settings: 'الإعدادات', tasks: 'المهام', send: 'إرسال', stop: 'إيقاف', mute: 'كتم الصوت', unmute: 'إلغاء الكتم', close: 'إغلاق', save: 'حفظ الإعدادات', cancel: 'إلغاء', placeholder: 'تحدّث إلى روكي…', tasksFiles: 'المهام والملفات', fileName: 'اسم الملف', content: 'المحتوى', createFile: 'إنشاء / تحديث الملف', replyLanguage: 'لغة الردود', voice: 'الصوت (أصوات الجهاز)', testVoice: 'اختبار الصوت', rate: 'سرعة الصوت', pitch: 'نبرة الصوت (أخفض = أعمق)', volume: 'مستوى الصوت', sfx: 'المؤثرات الصوتية', quality: 'جودة الجسيمات', lowQuality: 'جسيمات منخفضة الجودة (للأجهزة الضعيفة)', privacy: 'الخصوصية', clearConversation: 'مسح المحادثة', clearMemory: 'مسح الذاكرة (الاسم والملاحظات)', exportHistory: 'تصدير السجل كنص', introReplay: 'إعادة المقدمة', aiProvider: 'مزود الذكاء الاصطناعي', nameLabel: 'اسمك (محفوظ على الجهاز)', notesLabel: 'ملاحظات (محفوظة على الجهاز، قابلة للتعديل)', runPlan: 'تنفيذ الخطة', dismiss: 'تجاهل', thinking: 'روكي يفكّر…', unsupportedNote: 'الملفات تعيش في مخزن هذا التطبيق على هاتفك. لا يستطيع التطبيق الوصول إلى ملفات الهاتف، أو إرسال الرسائل، أو إجراء المكالمات، أو الشراء — تنطبق قواعد عزل أندرويد.' },
};
const SAMPLE_VOICE: Record<ReplyLang, string> = {
  en: 'Hello. I am ROCKY. Calm, direct, and ready.',
  fr: 'Bonjour. Je suis ROCKY. Calme, direct, et prêt.',
  ar: 'مرحباً. أنا روكي. هادئ، مباشر، وجاهز.',
};
const PLAN_DONE: Record<ReplyLang, string> = {
  en: 'Plan executed — the first file is created in the app store. Other steps are plan items, not system actions.',
  fr: 'Plan exécuté — le premier fichier est créé dans le stockage de l’application. Les autres étapes sont des éléments de plan, pas des actions système.',
  ar: 'تم تنفيذ الخطة — تم إنشاء الملف الأول في مخزن التطبيق. الخطوات الأخرى عناصر خطة، وليست إجراءات نظام.',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<RockyHologram | null>(null);
  const [state, setState] = useState<RockyState>('IDLE');
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadLocal('rocky-chat-v1', []));
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [wave, setWave] = useState<number[]>(Array.from({ length: 32 }, () => 2));
  const [drawer, setDrawer] = useState<'settings' | 'tasks' | null>(null);
  const drawerRef = useRef<typeof drawer>(null);
  const [lang, setLang] = useState<LangCode>(() => loadLocal('rocky-lang', 'auto'));
  const [replyLang, setReplyLang] = useState<ReplyLang>(() => loadLocal('rocky-reply-lang', 'en'));
  const [rate, setRate] = useState(() => loadLocal('rocky-rate', 1));
  const [pitch, setPitch] = useState(() => loadLocal('rocky-pitch', 0.78));
  const [volume, setVolume] = useState(() => loadLocal('rocky-volume', 1));
  const [muted, setMuted] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(() => loadLocal('rocky-sfx', true));
  const [sfxVolume, setSfxVolume] = useState(() => loadLocal('rocky-sfx-volume', 0.7));
  const [lowQuality, setLowQuality] = useState(() => loadLocal('rocky-lowq', false));
  const [profile, setProfile] = useState<UserProfile>(() => loadLocal('rocky-profile', DEFAULT_PROFILE));
  const [ai, setAi] = useState<AiSettings>({ mode: 'local', baseUrl: '', model: '', apiKey: '' });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(() => loadLocal('rocky-voice', ''));
  const [fileName, setFileName] = useState('notes.txt');
  const [fileContent, setFileContent] = useState('');
  const [filesTick, setFilesTick] = useState(0);
  const [confirm, setConfirm] = useState<{ action: string; run: () => void } | null>(null);
  const [proposed, setProposed] = useState<{ taskId: string; steps: string[] } | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [webglError, setWebglError] = useState('');
  const [showIntro, setShowIntro] = useState(false);
  const [introP, setIntroP] = useState(1);
  const introRaf = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const t = (k: UIKey) => UI[replyLang][k];
  const modeLabel = ai.mode === 'connected' && ai.apiKey ? 'CONNECTED (YOUR ENDPOINT)' : ai.mode === 'free' ? 'FREE PUBLIC ENDPOINT — NO KEY, NOT PRIVATE' : 'LOCAL ASSISTANT — LIMITED, NO CLOUD MODEL';
  const files = store.listFiles();
  void filesTick;

  useEffect(() => { drawerRef.current = drawer; }, [drawer]);
  useEffect(() => { sfx.enabled = sfxEnabled; localStorage.setItem('rocky-sfx', JSON.stringify(sfxEnabled)); }, [sfxEnabled]);
  useEffect(() => { sfx.setVolume(sfxVolume); localStorage.setItem('rocky-sfx-volume', JSON.stringify(sfxVolume)); }, [sfxVolume]);

  const startIntro = useCallback(() => {
    const holo = holoRef.current;
    if (!holo) { setShowIntro(false); return; }
    cancelAnimationFrame(introRaf.current);
    sfx.startHum();
    setShowIntro(true);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 3600);
      setIntroP(p);
      holo.setIntro(p);
      if (p < 1) { introRaf.current = requestAnimationFrame(step); }
      else {
        window.setTimeout(() => { setShowIntro(false); sfx.stopHum(); sfx.chime(); }, 500);
      }
    };
    introRaf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isMobile = window.innerWidth < 768 || /Android|iPhone/i.test(navigator.userAgent);
    let h: RockyHologram | null = null;
    try {
      h = new RockyHologram(canvas, { isMobile, lowQuality: loadLocal('rocky-lowq', false) });
    } catch (e: any) {
      setWebglError(`WebGL is not available on this device: ${e?.message || 'unknown error'}. Chat, files and settings still work below — only the 3D face is unavailable.`);
      return;
    }
    holoRef.current = h;
    const onLow = () => setLowQuality(true);
    window.addEventListener('rocky-low-fps', onLow);
    Preferences.get({ key: 'rocky-ai-settings' }).then(({ value }) => {
      if (value) { try { const parsed = JSON.parse(value); if (parsed.mode === 'offline') parsed.mode = 'local'; setAi(parsed); } catch { /* ignore */ } }
    }).catch(() => undefined);
    if (store.resumeInterrupted() > 0) setFilesTick((v) => v + 1);
    void audio.listVoices().then(setVoices).catch(() => undefined);
    // Android back button: close drawer first (via ref, not the stale initial
    // closure value that made v1 exit with a drawer open), else exit.
    let listener: any;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (drawerRef.current) setDrawer(null);
      else if (!canGoBack) CapApp.exitApp().catch(() => undefined);
    }).then((l) => { listener = l; });
    const seen = (() => { try { return localStorage.getItem('rocky-intro-seen'); } catch { return '1'; } })();
    if (!seen) {
      // intro starts after the first frame so the canvas exists
      window.setTimeout(() => { startIntro(); try { localStorage.setItem('rocky-intro-seen', '1'); } catch { /* ignore */ } }, 150);
    }
    return () => { cancelAnimationFrame(introRaf.current); h?.dispose(); window.removeEventListener('rocky-low-fps', onLow); listener?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { holoRef.current?.setState(state); }, [state]);
  useEffect(() => { holoRef.current?.setLowQuality(lowQuality); localStorage.setItem('rocky-lowq', JSON.stringify(lowQuality)); }, [lowQuality]);
  useEffect(() => { localStorage.setItem('rocky-chat-v1', JSON.stringify(messages.slice(-100))); }, [messages]);
  useEffect(() => { localStorage.setItem('rocky-profile', JSON.stringify(profile)); }, [profile]);
  useEffect(() => { localStorage.setItem('rocky-reply-lang', JSON.stringify(replyLang)); }, [replyLang]);
  useEffect(() => { localStorage.setItem('rocky-voice', JSON.stringify(voiceName)); }, [voiceName]);

  // amplitude loop: real mic RMS while listening, TTS envelope while speaking
  useEffect(() => {
    const id = setInterval(() => {
      if (state === 'LISTENING') {
        const rms = audio.rms();
        holoRef.current?.setAmplitude(rms);
        holoRef.current?.setMouth(0.05);
        setWave(Array.from({ length: 32 }, (_, i) => 2 + rms * 26 * (0.5 + 0.5 * Math.sin(i * 0.9 + Date.now() / 130))));
      } else if (state !== 'SPEAKING') {
        holoRef.current?.setAmplitude(0.06);
        holoRef.current?.setMouth(0.04 + 0.02 * Math.sin(Date.now() / 500));
        setWave(Array.from({ length: 32 }, () => 2));
      }
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  const speak = useCallback((text: string) => {
    if (muted) { setState('IDLE'); return; }
    setState('SPEAKING');
    audio.speak(text, { rate, pitch, volume, voiceName, lang: TTS_LANG[replyLang] },
      (a) => { holoRef.current?.setAmplitude(a); holoRef.current?.setMouth(a * 0.9); setWave(Array.from({ length: 32 }, (_, i) => 2 + a * 22 * (0.5 + 0.5 * Math.sin(i * 0.8)))); },
      () => { holoRef.current?.setMouth(0.05); setState('IDLE'); });
  }, [muted, rate, pitch, volume, voiceName, replyLang]);

  const pushRocky = (text: string, mode: AiSettings['mode']) => setMessages((m) => [...m, { role: 'rocky', text, at: Date.now(), mode }]);

  const runPlan = (taskId: string) => {
    const task = store.tasks.find((x) => x.id === taskId);
    if (!task || !task.steps) return;
    sfx.tap();
    setState('EXECUTING');
    store.setTask(taskId, 'running', 'Executing steps…');
    let failed = false;
    task.steps.forEach((step, i) => {
      if (step.text.startsWith('Create the first file')) {
        const goal = task.title.replace(/^plan:?\s*/i, '');
        const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'plan';
        try {
          const file = store.createFile(`${slug}.txt`, `# ${goal}\n\nDraft created by ROCKY from the plan "${task.title}".\n\nSteps:\n${task.steps!.map((s, j) => `${j + 1}. ${s.text}`).join('\n')}\n`);
          store.setStep(taskId, i, 'done', `Created real file ${file.name} in the app store.`);
        } catch {
          failed = true;
          store.setStep(taskId, i, 'failed', 'File creation failed.');
        }
      } else {
        store.setStep(taskId, i, 'done', 'Plan step reviewed — planning only, no system action.');
      }
    });
    store.setTask(taskId, failed ? 'failed' : 'done', failed ? 'Plan failed on a file step.' : 'Plan executed: file step created a real file; other steps are plan items.');
    setFilesTick((v) => v + 1);
    if (failed) { sfx.error(); setState('ERROR'); setTimeout(() => setState('IDLE'), 2000); }
    else { sfx.success(); const msg = PLAN_DONE[replyLang]; pushRocky(msg, ai.mode); speak(msg); }
  };

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: ChatMessage = { role: 'user', text: clean, at: Date.now(), mode: ai.mode };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    sfx.tap();

    const unsupported = isUnsupportedAction(clean);
    if (unsupported) {
      const msg = `UNSUPPORTED: ${unsupported} Nothing was done, and nothing was marked as done.`;
      pushRocky(msg, ai.mode);
      setState('ERROR'); sfx.error(); setTimeout(() => setState('IDLE'), 2500);
      return;
    }

    if (clean.toLowerCase().startsWith('plan:') || clean.toLowerCase().startsWith('plan ')) {
      const goal = clean.replace(/^plan:?\s*/i, '');
      const steps = planTask(goal);
      const task = store.addTaskWithSteps(clean, steps);
      setFilesTick((v) => v + 1);
      setProposed({ taskId: task.id, steps });
      const reply = replyLang === 'ar' ? `خطة جاهزة — ${steps.length} خطوات، لكنها معلّقة ولم يُنفَّذ شيء بعد. اضغط "تنفيذ الخطة" لتنفيذها فعلياً.` : replyLang === 'fr' ? `Plan prêt — ${steps.length} étapes, mais en attente : rien n’a encore été exécuté. Appuyez sur « Exécuter le plan » pour l’exécuter réellement.` : `Plan ready — ${steps.length} steps, but PENDING: nothing has been executed yet. Press "Run plan" to actually execute it.`;
      pushRocky(reply, ai.mode);
      speak(reply);
      return;
    }

    const cmd = parseLocalCommand(clean);
    if (cmd.kind === 'remember-name') { setProfile((p) => ({ ...p, name: cmd.name })); const r = localReply(clean, profile, new Date(), replyLang); pushRocky(r, ai.mode); speak(r); return; }
    if (cmd.kind === 'remember-note') { setProfile((p) => ({ ...p, notes: p.notes ? `${p.notes}\n- ${cmd.note}` : `- ${cmd.note}` })); const r = localReply(clean, profile, new Date(), replyLang); pushRocky(r, ai.mode); speak(r); return; }
    if (cmd.kind === 'file') {
      const file = store.createFile(cmd.name, cmd.content);
      setFilesTick((v) => v + 1);
      const r = replyLang === 'ar' ? `تم إنشاء الملف ${file.name} فعلياً في مخزن التطبيق.` : replyLang === 'fr' ? `Le fichier ${file.name} a réellement été créé dans le stockage de l’application.` : `File ${file.name} was actually created in the app store.`;
      pushRocky(r, ai.mode); sfx.success(); speak(r); return;
    }

    if (ai.mode === 'local') {
      const reply = localReply(clean, profile, new Date(), replyLang);
      pushRocky(reply, 'local');
      speak(reply);
      return;
    }
    if (ai.mode === 'free') {
      setState('THINKING'); setIsThinking(true);
      abortRef.current = new AbortController();
      try {
        const reply = await freeReply([...messages, userMsg], abortRef.current.signal, replyLang);
        pushRocky(reply, 'free');
        speak(reply);
      } catch (e: any) {
        const fallback = localReply(clean, profile, new Date(), replyLang);
        const msg = e?.name === 'AbortError' ? 'Cancelled.' : `Free endpoint failed: ${e?.message || 'unknown'}. Falling back to local tools: ${fallback}`;
        pushRocky(msg, 'free');
        setState('ERROR'); sfx.error(); setTimeout(() => setState('IDLE'), 2500);
      } finally { setIsThinking(false); }
      return;
    }
    // connected
    const connected = ai.mode === 'connected' && !!ai.apiKey && !!ai.baseUrl && !!ai.model;
    if (!connected) {
      const msg = 'Connected mode needs a base URL, model and key in Settings. Your key stays on this device only. Falling back to local tools.';
      pushRocky(msg, 'connected');
      speak(localReply(clean, profile, new Date(), replyLang));
      return;
    }
    setState('THINKING'); setIsThinking(true);
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
      pushRocky(msg, 'connected');
      setTimeout(() => setState('IDLE'), 2000);
    } finally { setIsThinking(false); }
  }, [ai, messages, profile, replyLang, speak]);

  const toggleMic = async () => {
    if (listening) { audio.stopRecognition(); audio.stopMic(); setListening(false); setState('IDLE'); return; }
    setMicError('');
    try {
      await audio.startMic();
      setListening(true);
      setState('LISTENING');
      sfx.chime();
      audio.startRecognition(lang, (text, final) => {
        setInput(text);
        if (final && text.trim()) { audio.stopRecognition(); audio.stopMic(); setListening(false); void send(text); }
      }, (err) => { setMicError(err); setState('ERROR'); setListening(false); audio.stopMic(); sfx.error(); setTimeout(() => setState('IDLE'), 2500); });
    } catch (e: any) {
      setMicError(`Microphone permission denied or unavailable: ${e?.message || 'unknown'}. Allow microphone permission in Android Settings > Apps > ROCKY AI > Permissions, then try again.`);
      setState('ERROR'); sfx.error();
      setTimeout(() => setState('IDLE'), 3000);
    }
  };

  const stopAll = () => {
    audio.stopSpeaking(); audio.stopRecognition(); audio.stopMic(); sfx.stopAll();
    abortRef.current?.abort();
    setListening(false); setState('IDLE');
  };

  const saveAi = async () => {
    await Preferences.set({ key: 'rocky-ai-settings', value: JSON.stringify(ai) }).catch(() => undefined);
    setDrawer(null); sfx.success();
  };

  const doDeleteFile = (name: string) => setConfirm({ action: `delete file "${name}"`, run: () => { store.deleteFile(name); setFilesTick((v) => v + 1); setConfirm(null); sfx.tap(); } });
  const doClearConversation = () => setConfirm({ action: 'clear the whole conversation history', run: () => { setMessages([]); try { localStorage.removeItem('rocky-chat-v1'); } catch { /* ignore */ } setConfirm(null); } });
  const doClearMemory = () => setConfirm({ action: 'clear your name and notes memory', run: () => { setProfile(DEFAULT_PROFILE); try { localStorage.removeItem('rocky-profile'); } catch { /* ignore */ } setConfirm(null); } });

  const buildExport = () => {
    const lines = messages.map((m) => `[${new Date(m.at).toLocaleString()}] ${m.role === 'user' ? 'YOU' : 'ROCKY'} (${m.mode}): ${m.text}`);
    setExportText(lines.join('\n') || '(no messages yet)');
  };

  const onStagePointer = (e: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    holoRef.current?.setGaze(nx, -ny);
  };

  const emptyGreeting = replyLang === 'ar' ? 'مرحباً. أنا روكي. اضغط الميكروفون وتحدّث، أو اكتب أدناه. جرّب: "plan: build a landing page".' : replyLang === 'fr' ? 'Bonjour. Je suis ROCKY. Appuyez sur le micro et parlez, ou écrivez ci-dessous. Essayez : « plan: build a landing page ».' : 'Hello. I am ROCKY. Tap the mic and speak, or type below. Try: “plan: build a landing page”.';

  return (
    <div className="app">
      <header>
        <div className="logo">ROCKY <span>AI</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => { sfx.tap(); setDrawer(drawer === 'tasks' ? null : 'tasks'); }}>{t('tasks')}</button>
          <button className="secondary" onClick={() => { sfx.tap(); void audio.listVoices().then(setVoices).catch(() => undefined); setDrawer(drawer === 'settings' ? null : 'settings'); }}>{t('settings')}</button>
        </div>
      </header>
      <div className="modebar">
        Mode: <b className={ai.mode === 'local' ? 'offline' : ai.mode === 'free' ? 'free' : 'connected'}>{modeLabel}</b>
        <span style={{ marginLeft: 'auto' }}><span className={`pill ${state === 'ERROR' ? 'ERROR' : ''}`}>{state}</span></span>
      </div>
      <div className="stage" ref={stageRef} onPointerMove={onStagePointer}>
        <canvas ref={canvasRef} />
        {webglError && <div className="notice" style={{ position: 'absolute', top: 8, left: 14, right: 14 }}>{webglError}</div>}
        <div className="wave">{wave.map((h, i) => <i key={i} style={{ height: h }} />)}</div>
      </div>
      {micError && <div className="notice">{micError}</div>}
      {proposed && (
        <div style={{ padding: '0 14px 6px' }}>
          <div className="file" style={{ borderStyle: 'dashed' }}>
            <b>Proposed plan — PENDING, not executed yet</b>
            <pre>{proposed.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}</pre>
            <div className="row"><button onClick={() => { runPlan(proposed.taskId); setProposed(null); }}>{t('runPlan')}</button><button className="secondary" onClick={() => setProposed(null)}>{t('dismiss')}</button></div>
          </div>
        </div>
      )}
      <div className="transcript">
        {messages.length === 0 && <div className="msg rocky"><div className="meta">ROCKY · {ai.mode.toUpperCase()}</div>{emptyGreeting}</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'rocky'}`}>
            <div className="meta">{m.role === 'user' ? 'YOU' : `ROCKY · ${m.mode.toUpperCase()}`}</div>{m.text}
          </div>
        ))}
        {isThinking && <div className="msg rocky thinking"><div className="meta">ROCKY</div>{t('thinking')}</div>}
      </div>
      <div className="controls">
        <button className={`mic ${listening ? 'live' : ''}`} onClick={toggleMic} aria-label="Microphone">{listening ? '■' : '🎤'}</button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('placeholder')} onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }} />
        <button onClick={() => void send(input)}>{t('send')}</button>
        <button className="secondary" onClick={stopAll}>{t('stop')}</button>
        <button className="secondary" onClick={() => { const m = !muted; setMuted(m); audio.muted = m; if (m) { audio.stopSpeaking(); sfx.stopAll(); } }}>{muted ? t('unmute') : t('mute')}</button>
      </div>

      {drawer === 'settings' && (
        <div className="drawer">
          <div className="row"><b>{t('settings')}</b><button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDrawer(null)}>{t('close')}</button></div>

          <label>{t('replyLanguage')}</label>
          <div className="row seg">
            {(['en', 'fr', 'ar'] as ReplyLang[]).map((l) => <button key={l} className={replyLang === l ? '' : 'secondary'} onClick={() => setReplyLang(l)}>{l === 'en' ? 'English' : l === 'fr' ? 'Français' : 'العربية'}</button>)}
          </div>
          <p style={{ fontSize: 12, opacity: 0.75 }}>Core Rocky replies and settings labels are translated. Full conversation text in free/connected mode follows the reply language in the model prompt; local tools use the translations above. This is partial i18n, not a fully translated app.</p>

          <label>{t('voice')}</label>
          <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
            <option value="">Auto (deep male voice if available)</option>
            {voices.map((v) => <option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang}){v.default ? ' — default' : ''}</option>)}
          </select>
          <div className="row" style={{ marginTop: 8 }}><button className="secondary" onClick={() => speak(SAMPLE_VOICE[replyLang])}>{t('testVoice')}</button><span style={{ fontSize: 12, opacity: 0.7 }}>{voices.length ? `${voices.length} device voices found` : 'No device voices listed yet — tap Test voice; if nothing speaks, the device has no TTS voice installed.'}</span></div>

          <label>{t('rate')}: {rate.toFixed(2)}</label>
          <input type="range" min="0.7" max="1.3" step="0.05" value={rate} onChange={(e) => { setRate(+e.target.value); localStorage.setItem('rocky-rate', JSON.stringify(+e.target.value)); }} />
          <label>{t('pitch')} (lower = deeper): {pitch.toFixed(2)}</label>
          <input type="range" min="0.5" max="1.2" step="0.01" value={pitch} onChange={(e) => { setPitch(+e.target.value); localStorage.setItem('rocky-pitch', JSON.stringify(+e.target.value)); }} />
          <label>{t('volume')}: {volume.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { setVolume(+e.target.value); localStorage.setItem('rocky-volume', JSON.stringify(+e.target.value)); }} />

          <label>{t('sfx')}</label>
          <div className="row seg">
            <button className={sfxEnabled ? '' : 'secondary'} onClick={() => setSfxEnabled(true)}>On</button>
            <button className={!sfxEnabled ? '' : 'secondary'} onClick={() => setSfxEnabled(false)}>Off</button>
          </div>
          <label>Sound-effects volume: {sfxVolume.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.05" value={sfxVolume} onChange={(e) => setSfxVolume(+e.target.value)} />

          <label>{t('quality')}</label>
          <div className="row"><label style={{ margin: 0 }}><input type="checkbox" checked={lowQuality} onChange={(e) => setLowQuality(e.target.checked)} /> {t('lowQuality')}</label></div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Auto quality is also on: if frame rate stays below ~24 fps, the app reduces particles and pixel ratio by itself.</p>

          <label>{t('nameLabel')}</label>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Oussama" />
          <label>{t('notesLabel')}</label>
          <textarea rows={3} value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} placeholder="Things ROCKY should remember…" />

          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>{t('aiProvider')}</b>
          <div className="row seg" style={{ marginTop: 8 }}>
            <button className={ai.mode === 'local' ? '' : 'secondary'} onClick={() => setAi({ ...ai, mode: 'local' })}>Local</button>
            <button className={ai.mode === 'free' ? '' : 'secondary'} onClick={() => setAi({ ...ai, mode: 'free' })}>Free public</button>
            <button className={ai.mode === 'connected' ? '' : 'secondary'} onClick={() => setAi({ ...ai, mode: 'connected' })}>Connected</button>
          </div>
          {ai.mode === 'local' && <p style={{ fontSize: 13, opacity: 0.8 }}>Local assistant — limited, no cloud model. Time, calculations, conversions, city times, memory, plans and files. It never pretends to be a model.</p>}
          {ai.mode === 'free' && <p style={{ fontSize: 13, color: '#fbbf24' }}>⚠️ Free public endpoint (Pollinations, no key): your prompt is sent in a URL to a public service. It is NOT private, it is rate-limited, and it may change or go down. Do not send sensitive information in this mode. Verified working from the build environment on 2026-10-24 (GET, HTTP 200, real answers), but on-device behaviour still needs a phone test.</p>}
          {ai.mode === 'connected' && <p style={{ fontSize: 13, opacity: 0.8 }}>Your key is stored only in this app on this phone. It is never bundled into the app, never committed to GitHub, never logged. Free-key options that need a key you obtain yourself (not bundled): OpenRouter free models, Groq free tier, Google AI Studio free tier — none were tested with a key here because no key exists in this project.</p>}
          <label>Speech recognition language</label>
          <select value={lang} onChange={(e) => { const v = e.target.value as LangCode; setLang(v); localStorage.setItem('rocky-lang', JSON.stringify(v)); }}>
            {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          {ai.mode === 'connected' && (<>
            <label>Base URL</label>
            <input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
            <label>Model</label>
            <input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
            <label>API key (on-device only)</label>
            <input type="password" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} placeholder="••••••••" />
          </>)}

          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>{t('privacy')}</b>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="secondary" onClick={doClearConversation}>{t('clearConversation')}</button>
            <button className="secondary" onClick={doClearMemory}>{t('clearMemory')}</button>
            <button className="secondary" onClick={buildExport}>{t('exportHistory')}</button>
            <button className="secondary" onClick={() => { setDrawer(null); startIntro(); }}>{t('introReplay')}</button>
          </div>
          {exportText && (<div className="file"><pre>{exportText}</pre><div className="row"><button onClick={() => { navigator.clipboard?.writeText(exportText).catch(() => undefined); sfx.tap(); }}>Copy export</button><button className="secondary" onClick={() => { const blob = new Blob([exportText], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'rocky-history.txt'; a.click(); URL.revokeObjectURL(url); }}>Download .txt</button><button className="secondary" onClick={() => setExportText(null)}>{t('close')}</button></div></div>)}
          <p style={{ fontSize: 12, opacity: 0.7 }}>Speech recognition for ar-DZ / fr-FR / en-US is NOT verified on a real device yet — test on your phone and report what actually works.</p>
          <div className="row" style={{ marginTop: 12 }}><button onClick={saveAi}>{t('save')}</button><button className="secondary" onClick={() => setDrawer(null)}>{t('cancel')}</button></div>
        </div>
      )}

      {drawer === 'tasks' && (
        <div className="drawer">
          <div className="row"><b>{t('tasksFiles')}</b><button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => setDrawer(null)}>{t('close')}</button></div>
          <label>{t('fileName')}</label>
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} />
          <label>{t('content')}</label>
          <textarea rows={5} value={fileContent} onChange={(e) => setFileContent(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => { store.createFile(fileName, fileContent); setFilesTick((v) => v + 1); sfx.success(); }}>{t('createFile')}</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>{t('unsupportedNote')}</p>
          {files.map((f) => (
            <div className="file" key={f.name}>
              <div className="row"><b>{f.name}</b><button className="danger" style={{ marginLeft: 'auto' }} onClick={() => { if (needsConfirmation('delete')) doDeleteFile(f.name); }}>Delete</button></div>
              <pre>{f.content}</pre>
            </div>
          ))}
          {store.tasks.map((task) => (
            <div className="file" key={task.id}>
              <div className="row"><b>{task.title}</b><span style={{ marginLeft: 'auto', fontSize: 12 }}>{task.status.toUpperCase()}</span></div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{task.detail}</div>
              {task.steps?.map((s, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}>{s.status === 'done' ? '✓' : s.status === 'failed' ? '✗' : '○'} {s.text}<span style={{ opacity: 0.7 }}>{s.detail ? ` — ${s.detail}` : ''}</span></div>)}
              {task.status === 'queued' && task.steps && <div className="row" style={{ marginTop: 8 }}><button onClick={() => runPlan(task.id)}>{t('runPlan')}</button></div>}
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div className="modal-bg"><div className="modal">
          <h3 style={{ marginTop: 0 }}>Confirm</h3>
          <p>Are you sure you want to {confirm.action}? This cannot be undone from inside ROCKY.</p>
          <div className="row"><button className="danger" onClick={confirm.run}>Yes, do it</button><button className="secondary" onClick={() => setConfirm(null)}>{t('cancel')}</button></div>
        </div></div>
      )}

      {showIntro && (
        <div className="intro" style={{ opacity: introP >= 1 ? 0 : 1 }}>
          <div className="intro-word" style={{ opacity: Math.max(0, introP * 1.4 - 0.2) }}>ROCKY</div>
          <div className="intro-sub" style={{ opacity: introP > 0.6 ? 1 : 0 }}>waking…</div>
          <button className="secondary intro-skip" onClick={() => { holoRef.current?.setIntro(1); setIntroP(1); setShowIntro(false); sfx.stopHum(); sfx.chime(); }}>Skip intro</button>
        </div>
      )}
    </div>
  );
}
