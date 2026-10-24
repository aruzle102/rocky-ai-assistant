import { useCallback, useEffect, useRef, useState } from 'react';
import { RockyHologram, type RockyState } from './rocky/hologram';
import { RockyAudio, LANG_OPTIONS, type LangCode } from './rocky/audio';
import { localReply, planTask, parseLocalCommand, type AiSettings, type ChatMessage, type UserProfile, type ReplyLang, TTS_LANG, DEFAULT_PROFILE } from './rocky/brain';
import { TaskStore, needsConfirmation, isUnsupportedAction, executePlan, loadReminders, saveReminders, type Reminder } from './rocky/tasks';
import { PROVIDERS, defaultProviderStates, providerDef, runEngine, runCompare, testProvider, discoverModels, researchWeb, classifyOpenTarget, type ProviderState, type EngineMode, type ResearchResult } from './rocky/providers';
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
  // --- v3 multi-model engine state (keys live in Preferences, never here) ---
  const [engineMode, setEngineMode] = useState<EngineMode>(() => loadLocal('rocky-engine-mode', 'smart'));
  const [providerStates, setProviderStates] = useState<ProviderState[]>(() => {
    const stored = loadLocal<ProviderState[] | null>('rocky-providers-v3', null);
    const defaults = defaultProviderStates();
    if (!stored) return defaults;
    return defaults.map((d) => { const s = stored.find((x) => x.id === d.id); return s ? { ...d, ...s, id: d.id } : d; });
  });
  const [fallbackOrder, setFallbackOrder] = useState<string[]>(() => loadLocal('rocky-fallback-order', PROVIDERS.map((x) => x.id)));
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [providerTest, setProviderTest] = useState<Record<string, string>>({});
  const [discovering, setDiscovering] = useState(false);
  const [compareMode, setCompareMode] = useState(() => loadLocal('rocky-compare', false));
  const [includeMemoryCloud, setIncludeMemoryCloud] = useState(() => loadLocal('rocky-memory-cloud', false));
  const [providerBanner, setProviderBanner] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>(() => loadReminders());
  const [reminderText, setReminderText] = useState('');
  const [reminderDue, setReminderDue] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [researchError, setResearchError] = useState('');
  const [openTarget, setOpenTarget] = useState('');
  const [openResult, setOpenResult] = useState('');
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
  const enabledProviders = providerStates.filter((s) => s.enabled && !s.autoDisabled).length;
  const modeLabel = engineMode === 'offline' ? 'OFFLINE — LOCAL TOOLS ONLY' : engineMode === 'smart' ? `SMART AUTO — MULTI-MODEL (${enabledProviders} ENABLED)` : engineMode === 'fast' ? 'FAST MODE — MULTI-MODEL' : 'DEEP REASONING — MULTI-MODEL';
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
    Preferences.get({ key: 'rocky-provider-keys' }).then(({ value }) => {
      if (value) { try { setProviderKeys(JSON.parse(value)); } catch { /* ignore */ } }
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
  useEffect(() => { localStorage.setItem('rocky-engine-mode', JSON.stringify(engineMode)); }, [engineMode]);
  useEffect(() => { localStorage.setItem('rocky-providers-v3', JSON.stringify(providerStates)); }, [providerStates]);
  useEffect(() => { localStorage.setItem('rocky-fallback-order', JSON.stringify(fallbackOrder)); }, [fallbackOrder]);
  useEffect(() => { localStorage.setItem('rocky-compare', JSON.stringify(compareMode)); }, [compareMode]);
  useEffect(() => { localStorage.setItem('rocky-memory-cloud', JSON.stringify(includeMemoryCloud)); }, [includeMemoryCloud]);
  useEffect(() => { saveReminders(reminders); }, [reminders]);
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

  const saveProviderKeys = async (keys: Record<string, string>) => {
    setProviderKeys(keys);
    await Preferences.set({ key: 'rocky-provider-keys', value: JSON.stringify(keys) }).catch(() => undefined);
  };
  const doTestProvider = async (id: string) => {
    const def = providerDef(id);
    const st = providerStates.find((s) => s.id === id)!;
    setProviderTest((m) => ({ ...m, [id]: 'Testing — real call in progress…' }));
    const res = await testProvider(def, st.model, providerKeys[id] || '');
    setProviderStates((prev) => prev.map((s) => s.id === id ? { ...s, lastTestAt: Date.now(), lastLatencyMs: res.latencyMs, successes: res.ok ? s.successes + 1 : s.successes, errors: res.ok ? s.errors : s.errors + 1, consecutiveFailures: res.ok ? 0 : s.consecutiveFailures + 1, autoDisabled: res.ok ? false : (s.consecutiveFailures + 1 >= 3), lastError: res.error, tested: res.ok ? true : s.tested } : s));
    if (res.ok) { setProviderBanner(''); setProviderTest((m) => ({ ...m, [id]: `✓ WORKING — ${res.latencyMs}ms — "${res.output.slice(0, 120)}"` })); sfx.success(); }
    else { setProviderTest((m) => ({ ...m, [id]: `✗ FAILED — ${res.latencyMs}ms — ${res.error}` })); sfx.error(); }
  };
  const doDiscover = async (id: string) => {
    const def = providerDef(id);
    setProviderTest((m) => ({ ...m, [id]: 'Discovering models…' }));
    try {
      const models = await discoverModels(def, providerKeys[id] || '');
      setProviderStates((prev) => prev.map((s) => s.id === id ? { ...s, models, tested: true } : s));
      setProviderTest((m) => ({ ...m, [id]: `✓ Discovered ${models.length} model(s): ${models.slice(0, 5).join(', ')}${models.length > 5 ? '…' : ''}` }));
    } catch (e: any) { setProviderTest((m) => ({ ...m, [id]: `✗ Discovery failed: ${e?.message || 'unknown'}` })); }
  };
  const doDiscoverAll = async () => {
    setDiscovering(true);
    for (const def of PROVIDERS) {
      if (def.id === 'local') continue;
      if (def.access === 'user-key' && !providerKeys[def.id] && !def.discoverableWithoutKey) { setProviderTest((m) => ({ ...m, [def.id]: 'Skipped — needs a key first.' })); continue; }
      await doDiscover(def.id);
    }
    setDiscovering(false);
  };
  const moveFallback = (id: string, dir: -1 | 1) => {
    setFallbackOrder((prev) => {
      const i = prev.indexOf(id); const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
  };
  const doResearch = async () => {
    setResearchError(''); setResearchResult(null);
    try { const r = await researchWeb(researchQuery); setResearchResult(r); sfx.success(); }
    catch (e: any) { setResearchError(e?.message || 'Research failed.'); sfx.error(); }
  };
  const doOpenLink = () => {
    const c = classifyOpenTarget(openTarget);
    if (!c.supported) { setOpenResult(`UNSUPPORTED: ${c.detail}`); sfx.error(); return; }
    try { window.open(openTarget.trim(), '_blank'); } catch { /* ignore */ }
    setOpenResult(`Link opened (or offered to your browser): ${openTarget.trim()} — if your device blocked it, the URL above is the result to use.`);
    sfx.tap();
  };
  const runPlan = async (taskId: string) => {
    const task = store.tasks.find((x) => x.id === taskId);
    if (!task || !task.steps) return;
    sfx.tap();
    setState('EXECUTING');
    try {
      const { report, failed } = await executePlan(task, store, {
        createFile: (n, c) => store.createFile(n, c),
        listFiles: () => store.listFiles(),
        research: (q) => researchWeb(q),
        addReminder: (text, due) => { const r: Reminder = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, dueAt: due, done: false, createdAt: Date.now() }; setReminders((prev) => [r, ...prev]); return r; },
        addNote: (note) => setProfile((pr) => ({ ...pr, notes: pr.notes ? `${pr.notes}
- ${note}` : `- ${note}` })),
      });
      setFilesTick((v) => v + 1);
      pushRocky(`Plan → Execute → Verify → Report:
${report}`, 'local');
      if (failed) { sfx.error(); setState('ERROR'); setTimeout(() => setState('IDLE'), 2500); }
      else { sfx.success(); speak(PLAN_DONE[replyLang]); }
    } catch (e: any) {
      sfx.error(); setState('ERROR'); setTimeout(() => setState('IDLE'), 2500);
      pushRocky(`Plan execution failed: ${e?.message || 'unknown'}. Nothing was marked done without verification.`, 'local');
    }
  };

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: ChatMessage = { role: 'user', text: clean, at: Date.now(), mode: ai.mode };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    sfx.tap();
    audio.stopSpeaking(); // sending text interrupts any current speech

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

    if (engineMode === 'offline') {
      const reply = localReply(clean, profile, new Date(), replyLang);
      pushRocky(reply, 'local');
      speak(reply);
      return;
    }
    setState('THINKING'); setIsThinking(true);
    abortRef.current = new AbortController();
    const langName = replyLang === 'fr' ? 'French' : replyLang === 'ar' ? 'Arabic' : 'English';
    const memoryText = includeMemoryCloud && (profile.name || profile.notes)
      ? ` User memory (the user explicitly allowed this in cloud requests): name=${profile.name}; notes=${profile.notes}.`
      : '';
    const engineMessages = [
      { role: 'system', content: `You are ROCKY, a calm, confident, direct masculine AI assistant. Answer concisely in ${langName}.${memoryText}` },
      ...[...messages, userMsg].slice(-20).map((m) => ({ role: m.role === 'rocky' ? 'assistant' : 'user', content: m.text })),
    ];
    try {
      if (compareMode) {
        const res = await runCompare({ mode: engineMode, fallbackOrder, states: providerStates, keys: providerKeys, messages: engineMessages, signal: abortRef.current.signal });
        setProviderStates(res.states);
        const combined = `Compare mode — each model's answer (the synthesis below is assembled locally from these answers, not a third model call):\n\n${res.compareAnswers!.map((a) => `— ${providerDef(a.providerId).name} (${a.model}, ${a.latencyMs}ms):\n${a.text}`).join('\n\n')}`;
        setMessages((m) => [...m, { role: 'rocky', text: combined, at: Date.now(), mode: 'connected', provider: res.providerId, model: res.model, latencyMs: res.latencyMs }]);
        speak(res.compareAnswers![0].text);
      } else {
        const res = await runEngine({ mode: engineMode, fallbackOrder, states: providerStates, keys: providerKeys, messages: engineMessages, signal: abortRef.current.signal });
        const wasEnabled = providerStates.find((x) => x.id === res.providerId);
        setProviderStates(res.states);
        const auto = res.states.find((x) => x.autoDisabled && wasEnabled && !wasEnabled.autoDisabled);
        if (auto) setProviderBanner(`${providerDef(auto.id).name} was auto-disabled after 3 consecutive failures. Fix its key/model in Settings, then re-enable it.`);
        setMessages((m) => [...m, { role: 'rocky', text: res.text, at: Date.now(), mode: res.providerId === 'pollinations' ? 'free' : 'connected', provider: res.providerId, model: res.model, latencyMs: res.latencyMs }]);
        speak(res.text);
      }
    } catch (e: any) {
      const errStates = (e as any).states as ProviderState[] | undefined;
      if (errStates) setProviderStates(errStates);
      const attempts = (e as any).attempts as { providerId: string; error: string }[] | undefined;
      const attemptText = attempts ? attempts.map((a) => `${a.providerId}: ${a.error}`).join(' | ') : (e?.message || 'unknown');
      const fallback = localReply(clean, profile, new Date(), replyLang);
      const msg = e?.name === 'AbortError' ? 'Cancelled.' : `All enabled providers failed: ${attemptText}. Honest fallback from local tools (NOT a model answer): ${fallback}`;
      pushRocky(msg, 'local');
      speak(fallback);
    } finally { setIsThinking(false); }
  }, [ai, messages, profile, replyLang, speak, engineMode, fallbackOrder, providerStates, providerKeys, compareMode, includeMemoryCloud]);

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
        Mode: <b className={engineMode === 'offline' ? 'offline' : 'connected'}>{modeLabel}</b>
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
            <div className="meta">{m.role === 'user' ? 'YOU' : `ROCKY · ${m.mode.toUpperCase()}${m.provider ? ` · ${m.provider}${m.model ? `/${m.model}` : ''}${m.latencyMs != null ? ` · ${m.latencyMs}ms` : ''}` : ''}`}</div>{m.text}
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
          <b>{t('aiProvider')} — Multi-model engine (v3)</b>
          <p style={{ fontSize: 13, opacity: 0.85 }}>Smart Auto picks the fastest healthy provider for short questions and a reasoning-capable provider for long/complex ones. Fast prefers speed; Deep Reasoning prefers reasoning models; Offline uses local tools only. Failover tries at most 3 providers per request (primary + 2 fallbacks) — never infinite retries. A provider is only shown as WORKING after a real test call succeeds.</p>
          <div className="row seg" style={{ marginTop: 8 }}>
            <button className={engineMode === 'smart' ? '' : 'secondary'} onClick={() => setEngineMode('smart')}>Smart Auto</button>
            <button className={engineMode === 'fast' ? '' : 'secondary'} onClick={() => setEngineMode('fast')}>Fast</button>
            <button className={engineMode === 'deep' ? '' : 'secondary'} onClick={() => setEngineMode('deep')}>Deep Reasoning</button>
            <button className={engineMode === 'offline' ? '' : 'secondary'} onClick={() => setEngineMode('offline')}>Offline</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}><input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} /> Compare mode (ask up to 2 providers, show each answer separately)</label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}><input type="checkbox" checked={includeMemoryCloud} onChange={(e) => setIncludeMemoryCloud(e.target.checked)} /> Include my name/notes in cloud model requests (OFF by default for cloud; local tools always use on-device memory)</label>
          </div>
          {providerBanner && <div className="notice" style={{ padding: '8px 0' }}>{providerBanner}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="secondary" onClick={() => void doDiscoverAll()} disabled={discovering}>{discovering ? 'Discovering…' : 'Discover providers + models'}</button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Discovery calls the live models endpoint where the API allows it. Keyed providers without a key are skipped.</span>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Fallback order (top = tried first). Keys are stored only in this app on this phone (Capacitor Preferences), masked in the UI, never in the app bundle or GitHub. Algeria access was NOT verified from Algeria — confirm on your phone.</p>
          {fallbackOrder.map((pid) => {
            const def = providerDef(pid);
            const st = providerStates.find((x) => x.id === pid)!;
            if (!st) return null;
            return (
              <div className="file" key={pid}>
                <div className="row"><b>{def.name}</b><span style={{ fontSize: 11, marginLeft: 6 }}>{def.access === 'keyless' ? 'NO KEY' : def.access === 'local' ? 'ON-DEVICE' : 'YOUR KEY'} · {def.status}{st.tested ? ' · TESTED ✓' : ''}{st.autoDisabled ? ' · AUTO-DISABLED (3 failures)' : ''}</span><span style={{ marginLeft: 'auto', fontSize: 12 }}>{st.enabled && !st.autoDisabled ? 'ENABLED' : 'DISABLED'}</span></div>
                <p style={{ fontSize: 12, opacity: 0.85, margin: '6px 0' }}>{def.note}</p>
                <p style={{ fontSize: 12, opacity: 0.75, margin: '6px 0' }}>Free limits (as documented 2026-10-24): {def.freeLimits}</p>
                <p style={{ fontSize: 12, opacity: 0.75, margin: '6px 0' }}>Setup: {def.setupSteps.join(' ')} {def.signupUrl ? `Get a key: ${def.signupUrl}` : ''}</p>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="secondary" onClick={() => setProviderStates((prev) => prev.map((x) => x.id === pid ? { ...x, enabled: !x.enabled, autoDisabled: false, consecutiveFailures: 0 } : x))}>{st.enabled ? 'Disable' : 'Enable'}</button>
                  <button className="secondary" onClick={() => moveFallback(pid, -1)}>↑ Fallback</button>
                  <button className="secondary" onClick={() => moveFallback(pid, 1)}>↓ Fallback</button>
                  <button className="secondary" onClick={() => void doTestProvider(pid)}>Test connection + prompt</button>
                  <button className="secondary" onClick={() => void doDiscover(pid)}>Discover models</button>
                </div>
                <label>Model {st.models.length ? '(discovered — pick one)' : '(type the exact model id)'}</label>
                {st.models.length ? (
                  <select value={st.model} onChange={(e) => setProviderStates((prev) => prev.map((x) => x.id === pid ? { ...x, model: e.target.value } : x))}>
                    {st.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input value={st.model} onChange={(e) => setProviderStates((prev) => prev.map((x) => x.id === pid ? { ...x, model: e.target.value } : x))} placeholder="model id" />
                )}
                {def.access === 'user-key' && (<>
                  <label>API key (on-device only, masked) — {providerKeys[pid] ? 'key saved on-device (••••)' : 'no key saved'}</label>
                  <input type="password" value={keyDrafts[pid] || ''} onChange={(e) => setKeyDrafts((m) => ({ ...m, [pid]: e.target.value }))} placeholder="Paste key here, then Connect" />
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="secondary" onClick={() => { const k = (keyDrafts[pid] || '').trim(); if (!k) { setProviderTest((m) => ({ ...m, [pid]: 'Paste a key first.' })); return; } void saveProviderKeys({ ...providerKeys, [pid]: k }).then(() => { setKeyDrafts((m) => ({ ...m, [pid]: '' })); setProviderTest((m) => ({ ...m, [pid]: 'Key saved on-device (masked). Tap Test to verify it works.' })); }); }}>Connect (save key)</button>
                    <button className="secondary" onClick={() => { const next = { ...providerKeys }; delete next[pid]; void saveProviderKeys(next).then(() => setProviderTest((m) => ({ ...m, [pid]: 'Disconnected — key removed from this device.' }))); }}>Disconnect (remove key)</button>
                  </div>
                </>)}
                {def.access === 'keyless' && <p style={{ fontSize: 12, color: '#fbbf24' }}>⚠️ Not private: prompts go to a public endpoint. Do not send sensitive information.</p>}
                <p style={{ fontSize: 12, opacity: 0.75 }}>Health: {st.lastTestAt ? `last test ${new Date(st.lastTestAt).toLocaleString()}, ${st.lastLatencyMs ?? '?'}ms` : 'never tested'} · ✓ {st.successes} · ✗ {st.errors}{st.lastError ? ` · last error: ${st.lastError}` : ''}</p>
                {providerTest[pid] && <div className="file" style={{ margin: '6px 0' }}><pre>{providerTest[pid]}</pre></div>}
              </div>
            );
          })}
          <label>Speech recognition language</label>
          <select value={lang} onChange={(e) => { const v = e.target.value as LangCode; setLang(v); localStorage.setItem('rocky-lang', JSON.stringify(v)); }}>
            {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>

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
          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>Web research (real tool)</b>
          <label>Question</label>
          <input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} placeholder="e.g. What is the capital of Algeria?" />
          <div className="row" style={{ marginTop: 8 }}><button onClick={() => void doResearch()}>Research the web</button></div>
          {researchError && <div className="notice">{researchError}</div>}
          {researchResult && (<div className="file"><b>Source: {researchResult.source}</b><pre>{researchResult.summary}</pre><div style={{ fontSize: 12, wordBreak: 'break-all' }}>{researchResult.url}</div><div className="row" style={{ marginTop: 8 }}><button onClick={() => { const slug = researchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'research'; const f = store.createFile(`research-${slug}.txt`, `Query: ${researchQuery}\nSource: ${researchResult.source}\nURL: ${researchResult.url}\n\n${researchResult.summary}\n`); const ok = store.listFiles().some((x) => x.name === f.name && x.content.includes(researchResult.summary.slice(0, 40))); setFilesTick((v) => v + 1); setResearchResult(null); setResearchQuery(''); pushRocky(ok ? `Research saved + verified as file ${f.name}.` : 'Research save verification failed — file not found after creation.', 'local'); }}>Save as file (verified)</button><button className="secondary" onClick={() => setResearchResult(null)}>Dismiss</button></div></div>)}
          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>Reminders (in-app only — NOT system alarms)</b>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Reminders are stored in this app and shown here. They do NOT fire system notifications or alarms — that would need a notifications plugin and is not built in v3.</p>
          <label>Reminder text</label>
          <input value={reminderText} onChange={(e) => setReminderText(e.target.value)} placeholder="e.g. Call the supplier tomorrow" />
          <label>Due (optional, defaults to +1 hour)</label>
          <input type="datetime-local" value={reminderDue} onChange={(e) => setReminderDue(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}><button onClick={() => { if (!reminderText.trim()) return; const due = reminderDue ? new Date(reminderDue).getTime() : Date.now() + 3600_000; const r: Reminder = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: reminderText.trim(), dueAt: due, done: false, createdAt: Date.now() }; setReminders((prev) => [r, ...prev]); setReminderText(''); setReminderDue(''); sfx.success(); }}>Add reminder</button></div>
          {reminders.map((r) => (<div className="file" key={r.id}><div className="row"><b>{r.done ? '✓ ' : '○ '}{r.text}</b><span style={{ marginLeft: 'auto', fontSize: 12 }}>due {new Date(r.dueAt).toLocaleString()}</span></div><div className="row" style={{ marginTop: 6 }}><button className="secondary" onClick={() => setReminders((prev) => prev.map((x) => x.id === r.id ? { ...x, done: !x.done } : x))}>{r.done ? 'Reopen' : 'Mark done'}</button></div></div>))}
          <hr style={{ borderColor: '#1e3a5f' }} />
          <b>Open a link</b>
          <label>URL (http/https only)</label>
          <input value={openTarget} onChange={(e) => setOpenTarget(e.target.value)} placeholder="https://example.com" />
          <div className="row" style={{ marginTop: 8 }}><button onClick={doOpenLink}>Open link</button></div>
          {openResult && <div className="file"><pre>{openResult}</pre></div>}

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
