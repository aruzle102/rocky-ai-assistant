/** Provider-independent AI layer — three honest modes, labelled at all times.
 *  - 'local': a genuinely useful LOCAL assistant (time/date, calculator,
 *    unit conversion, city times, editable memory, task planning, file
 *    commands). It is NOT a cloud model and never claims to be one.
 *  - 'free': Pollinations text API via a no-key GET request. Verified from
 *    this build environment on 2026-10-24: GET returned real model text
 *    ("42" for 17+25, "Algiers is the capital of Algeria", HTTP 200, ~5s).
 *    The POST path timed out once in 30s and was slow a second time, so the
 *    app uses GET only. Prompts travel in the URL to a public endpoint:
 *    NOT private, rate-limited, may change or disappear — off by default,
 *    with a privacy warning in Settings, and never for sensitive input.
 *  - 'connected': user-configured OpenAI-compatible endpoint, key stored
 *    ONLY on-device via Capacitor Preferences, never bundled or committed.
 * No key is invented, no unlimited free quota is claimed. */

export type AiMode = 'local' | 'free' | 'connected';
export type ReplyLang = 'en' | 'fr' | 'ar';

export interface AiSettings {
  mode: AiMode;
  baseUrl: string;
  model: string;
  apiKey: string; // held in memory + on-device Preferences only; never in source
}

export interface ChatMessage { role: 'user' | 'rocky'; text: string; at: number; mode: AiMode }
export interface UserProfile { name: string; language: string; notes: string }
export const DEFAULT_PROFILE: UserProfile = { name: '', language: 'auto', notes: '' };

export const TTS_LANG: Record<ReplyLang, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' };
const LOCALE: Record<ReplyLang, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' };

const STRINGS: Record<ReplyLang, { greeting: string; identity: string; help: string; thanks: string; general: string }> = {
  en: {
    greeting: 'Hello{NAME}. I am ROCKY — calm, direct, and ready. What do you want to build today?',
    identity: 'I am ROCKY AI, a holographic assistant. Right now I am running locally on your phone — no cloud model is connected. Switch to the free public endpoint or add your own model in Settings for open-ended answers.',
    help: 'Locally, I can: tell the time and date, calculate, convert units, give city times, remember your name and notes, plan a task step by step, and create text files in the Tasks panel. For open-ended answers, switch to the free public endpoint or a connected model in Settings.',
    thanks: 'You are welcome. Precision, no noise — that is the deal.',
    general: 'Understood. In local mode I work from built-in tools only — I do not pretend to be a cloud model. Ask for the time, a calculation, a conversion, or a task plan, or switch modes in Settings.',
  },
  fr: {
    greeting: 'Bonjour{NAME}. Je suis ROCKY — calme, direct, et prêt. Que voulez-vous construire aujourd’hui ?',
    identity: 'Je suis ROCKY AI, un assistant holographique. Pour le moment, je fonctionne localement sur votre téléphone — aucun modèle cloud n’est connecté. Passez au point de terminaison public gratuit ou ajoutez votre propre modèle dans Réglages pour des réponses ouvertes.',
    help: 'Localement, je peux : donner l’heure et la date, calculer, convertir des unités, donner l’heure dans des villes, retenir votre nom et vos notes, planifier une tâche étape par étape et créer des fichiers texte dans le panneau Tâches. Pour des réponses ouvertes, passez au point de terminaison public gratuit ou à un modèle connecté dans Réglages.',
    thanks: 'Avec plaisir. Précision, sans bruit — c’est le principe.',
    general: 'Compris. En mode local, je travaille uniquement avec des outils intégrés — je ne prétends pas être un modèle cloud. Demandez l’heure, un calcul, une conversion ou un plan de tâche, ou changez de mode dans Réglages.',
  },
  ar: {
    greeting: 'مرحباً{NAME}. أنا روكي — هادئ، مباشر، وجاهز. ماذا تريد أن تبني اليوم؟',
    identity: 'أنا روكي AI، مساعد ثلاثي الأبعاد. حالياً أعمل محلياً على هاتفك — لا يوجد نموذج سحابي متصل. بدّل إلى النقطة العامة المجانية أو أضف نموذجك الخاص من الإعدادات للحصول على إجابات مفتوحة.',
    help: 'محلياً، أستطيع: إخبارك بالوقت والتاريخ، الحساب، تحويل الوحدات، إعطاء وقت المدن، تذكر اسمك وملاحظاتك، تخطيط مهمة خطوة بخطوة، وإنشاء ملفات نصية في لوحة المهام. للإجابات المفتوحة، بدّل إلى النقطة العامة المجانية أو نموذج متصل من الإعدادات.',
    thanks: 'على الرحب والسعة. الدقة، بلا ضجيج — هذا هو المبدأ.',
    general: 'فهمت. في الوضع المحلي أعمل بأدوات مدمجة فقط — ولا أدّعي أنني نموذج سحابي. اطلب الوقت، أو عملية حسابية، أو تحويلاً، أو خطة مهمة، أو بدّل الوضع من الإعدادات.',
  },
};

export function detectIntent(text: string): string {
  const t = text.toLowerCase();
  if (/(^|\s)(hi|hello|hey|salut|bonjour|سلام|مرحبا)\b/.test(t) || /^(hi|hello|hey|salut|bonjour)/.test(t)) return 'greeting';
  if (t.includes('your name') || t.includes('who are you') || t.includes('qui es-tu') || t.includes('اسمك') || t.includes('من انت')) return 'identity';
  if (t.includes('time in') || t.includes('heure à') || t.includes('الوقت في')) return 'timezone';
  if (t.includes('time') || t.includes('heure') || t.includes('الساعة') || t.includes('what time')) return 'time';
  if (t.includes('date') || t.includes('today') || t.includes("aujourd") || t.includes('اليوم')) return 'date';
  if (t.includes('help') || t.includes('what can you do') || t.includes('aide') || t.includes('مساعدة')) return 'help';
  if (t.includes('remember') || t.includes('my name is') || t.includes('je m\'appelle') || t.includes('اسمي') || t.includes('تذكر')) return 'remember';
  if (t.includes('thank') || t.includes('merci') || t.includes('شكرا')) return 'thanks';
  if (/(what is|calculate|calcule|احسب)\s+[\d\s+\-*/x×÷().]+/.test(t) || /^\s*[\d\s+\-*/x×÷().]+\s*$/.test(t)) return 'calc';
  if (/convert|convertir|حوّل|in (miles|km|pounds|kg|fahrenheit|celsius)/.test(t)) return 'convert';
  return 'general';
}

/** Safe arithmetic: tokeniser + recursive descent. No eval(), no Function(). */
export function evalArithmetic(expr: string): number | null {
  const s = expr.replace(/×/g, '*').replace(/x/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(s) || !s) return null;
  let i = 0;
  const parseExpr = (): number => {
    let v = parseTerm();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) { const op = s[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (i < s.length && (s[i] === '*' || s[i] === '/')) { const op = s[i++]; const r = parseFactor(); if (op === '/' && r === 0) throw new Error('div0'); v = op === '*' ? v * r : v / r; }
    return v;
  };
  const parseFactor = (): number => {
    if (s[i] === '(') { i++; const v = parseExpr(); if (s[i] !== ')') throw new Error('paren'); i++; return v; }
    if (s[i] === '-') { i++; return -parseFactor(); }
    const m = /^[0-9]*\.?[0-9]+/.exec(s.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  try {
    const v = parseExpr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch { return null; }
}

const UNITS: Record<string, { to: string; factor: number; offset?: number }> = {
  'km->mi': { to: 'miles', factor: 0.621371 }, 'mi->km': { to: 'km', factor: 1.60934 },
  'm->ft': { to: 'feet', factor: 3.28084 }, 'ft->m': { to: 'meters', factor: 0.3048 },
  'kg->lb': { to: 'pounds', factor: 2.20462 }, 'lb->kg': { to: 'kg', factor: 0.453592 },
};
export function convertUnits(text: string): string | null {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*(km|mi|miles?|m|ft|feet|kg|lb|pounds?|°?c|°?f|celsius|fahrenheit)\s*(?:to|in|->|vers|إلى)\s*(km|mi|miles?|m|ft|feet|kg|lb|pounds?|°?c|°?f|celsius|fahrenheit)/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const norm = (u: string) => u.toLowerCase().replace('°', '').replace(/miles?/, 'mi').replace(/feet/, 'ft').replace(/pounds?/, 'lb').replace('celsius', 'c').replace('fahrenheit', 'f');
  const a = norm(m[2]); const b = norm(m[3]);
  if ((a === 'c' && b === 'f')) return `${v}°C = ${(v * 9 / 5 + 32).toFixed(1)}°F`;
  if ((a === 'f' && b === 'c')) return `${v}°F = ${((v - 32) * 5 / 9).toFixed(1)}°C`;
  const key = `${a}->${b}`;
  const conv = UNITS[key];
  if (!conv) return null;
  return `${v} ${a} = ${(v * conv.factor).toFixed(2)} ${conv.to}`;
}

const CITIES: Record<string, string> = {
  algiers: 'Africa/Algiers', alger: 'Africa/Algiers', paris: 'Europe/Paris', london: 'Europe/London',
  londres: 'Europe/London', 'new york': 'America/New_York', tokyo: 'Asia/Tokyo', dubai: 'Asia/Dubai',
};

/** Structured local commands the app actually executes (not just replies). */
export type LocalCommand =
  | { kind: 'remember-name'; name: string }
  | { kind: 'remember-note'; note: string }
  | { kind: 'file'; name: string; content: string }
  | { kind: 'none' };

export function parseLocalCommand(text: string): LocalCommand {
  let m = text.match(/(?:my name is|je m'appelle|اسمي)\s+([A-Za-zÀ-ÿ' -]+)/i);
  if (m) return { kind: 'remember-name', name: m[1].trim() };
  m = text.match(/(?:remember that|remember:|note that|تذكر أن)\s+(.+)/i);
  if (m) return { kind: 'remember-note', note: m[1].trim() };
  m = text.match(/(?:create file|créer le fichier|أنشئ ملف)\s+([A-Za-z0-9._-]+)(?:\s+(?:with|containing|avec|:)\s+(.+))?/is);
  if (m) return { kind: 'file', name: m[1], content: (m[2] || '').trim() };
  return { kind: 'none' };
}

/** Pure local reply — used by tests and by the local assistant. */
export function localReply(text: string, profile: UserProfile, now = new Date(), lang: ReplyLang = 'en'): string {
  const s = STRINGS[lang];
  const intent = detectIntent(text);
  const name = profile.name ? (lang === 'ar' ? `، ${profile.name}` : lang === 'fr' ? `, ${profile.name}` : `, ${profile.name}`) : '';
  const locale = LOCALE[lang];
  switch (intent) {
    case 'greeting': return s.greeting.replace('{NAME}', name);
    case 'identity': return s.identity;
    case 'time': return now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    case 'date': return now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    case 'timezone': {
      const lower = text.toLowerCase();
      const city = Object.keys(CITIES).find((c) => lower.includes(c));
      if (!city) return s.general;
      const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: CITIES[city] });
      return lang === 'ar' ? `الوقت في ${city} هو ${time}` : lang === 'fr' ? `Il est ${time} à ${city}.` : `It is ${time} in ${city}.`;
    }
    case 'help': return s.help;
    case 'remember': {
      const cmd = parseLocalCommand(text);
      if (cmd.kind === 'remember-name') return lang === 'ar' ? `تم — سأتذكرك باسم ${cmd.name}.` : lang === 'fr' ? `Noté — je me souviendrai de vous comme ${cmd.name}.` : `Noted — I will remember you as ${cmd.name}.`;
      if (cmd.kind === 'remember-note') return lang === 'ar' ? `تم حفظ الملاحظة.` : lang === 'fr' ? `Note enregistrée.` : 'Note saved.';
      return lang === 'ar' ? 'أخبرني ماذا أتذكر، مثلاً: "اسمي أسامة".' : lang === 'fr' ? 'Dites-moi quoi retenir, par exemple : « je m’appelle Oussama ».' : 'Tell me what to remember, for example: "my name is Oussama".';
    }
    case 'thanks': return s.thanks;
    case 'calc': {
      // Extract the arithmetic part AFTER the question words (a bare
      // character-class match would otherwise grab the first space).
      const afterQ = text.match(/(?:what is|calculate|calcule|احسب)\s+([\d\s+\-*/x×÷().]+)/i);
      const exprMatch = afterQ ? afterQ[1] : (/^\s*[\d\s+\-*/x×÷().]+\s*$/.test(text) ? text : null);
      const v = exprMatch ? evalArithmetic(exprMatch) : null;
      if (v === null) return s.general;
      const out = Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '');
      return lang === 'ar' ? `النتيجة: ${out}` : lang === 'fr' ? `Résultat : ${out}` : `Result: ${out}`;
    }
    case 'convert': return convertUnits(text) || s.general;
    default: return s.general;
  }
}

export function planTask(goal: string): string[] {
  const g = goal.trim();
  if (!g) return [];
  return [
    `Clarify the goal: ${g}`,
    'Break it into the smallest shippable steps',
    `Create the first file for: ${g}`,
    'Review it, fix what is wrong, then ship it',
  ];
}

/** Free public endpoint (Pollinations, no key, GET only — verified 2026-10-24).
 * Prompt goes in the URL: never send sensitive input through this mode. */
export async function freeReply(messages: ChatMessage[], signal: AbortSignal, lang: ReplyLang): Promise<string> {
  const langName = lang === 'fr' ? 'French' : lang === 'ar' ? 'Arabic' : 'English';
  const history = messages.slice(-6).map((m) => `${m.role === 'rocky' ? 'ROCKY' : 'User'}: ${m.text}`).join('\n').slice(-1500);
  const prompt = `You are ROCKY, a calm, confident, direct masculine AI assistant. Answer concisely in ${langName}.\n${history}`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Free public endpoint returned HTTP ${res.status}. It may be rate-limited or down — try again later or switch modes.`);
  const text = (await res.text()).trim();
  if (!text) throw new Error('Free public endpoint returned an empty reply.');
  return text;
}

export async function connectedReply(
  messages: ChatMessage[], settings: AiSettings, signal: AbortSignal, onToken?: (t: string) => void,
): Promise<string> {
  const url = settings.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      stream: !!onToken,
      messages: [
        { role: 'system', content: 'You are ROCKY, a calm, confident, direct masculine AI assistant. Answer concisely.' },
        ...messages.slice(-20).map((m) => ({ role: m.role === 'rocky' ? 'assistant' : 'user', content: m.text })),
      ],
    }),
  });
  if (!res.ok) throw new Error(`Model endpoint returned HTTP ${res.status}. Check base URL, model name and key in Settings.`);
  if (!onToken || !res.body) return (await res.json()).choices?.[0]?.message?.content || '(empty reply from model)';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const tok = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (tok) { full += tok; onToken(tok); }
      } catch { /* ignore partial SSE frames */ }
    }
  }
  return full;
}
