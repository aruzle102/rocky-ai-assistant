/** Provider-independent AI layer.
 * Default mode = LOCAL OFFLINE BRAIN (no key, no network, clearly labelled).
 * Optional mode = user-configured OpenAI-compatible endpoint, key stored
 * ONLY on-device via Capacitor Preferences, never bundled or committed. */

export type AiMode = 'offline' | 'connected';

export interface AiSettings {
  mode: AiMode;
  baseUrl: string;
  model: string;
  apiKey: string; // held in memory + on-device Preferences only; never in source
}

export interface ChatMessage { role: 'user' | 'rocky'; text: string; at: number; mode: AiMode }

export interface UserProfile { name: string; language: string; notes: string }

export const DEFAULT_PROFILE: UserProfile = { name: '', language: 'auto', notes: '' };

export function detectIntent(text: string): string {
  const t = text.toLowerCase();
  if (/(^|\s)(hi|hello|hey|salut|bonjour|سلام|مرحبا)\b/.test(t) || /^(hi|hello|hey|salut|bonjour)/.test(t)) return 'greeting';
  if (t.includes('your name') || t.includes('who are you') || t.includes('qui es-tu') || t.includes('اسمك')) return 'identity';
  if (t.includes('time') || t.includes('heure') || t.includes('الساعة') || t.includes('what time')) return 'time';
  if (t.includes('date') || t.includes('today') || t.includes("aujourd") || t.includes('اليوم')) return 'date';
  if (t.includes('help') || t.includes('what can you do') || t.includes('aide') || t.includes('مساعدة')) return 'help';
  if (t.includes('remember') || t.includes('my name is') || t.includes('je m\'appelle') || t.includes('اسمي')) return 'remember';
  if (t.includes('thank')) return 'thanks';
  return 'general';
}

/** Pure local reply generator — used by tests and by the offline brain. */
export function localReply(text: string, profile: UserProfile, now = new Date()): string {
  const intent = detectIntent(text);
  const name = profile.name ? `, ${profile.name}` : '';
  switch (intent) {
    case 'greeting': return `Hello${name}. I am ROCKY — calm, direct, and ready. What do you want to build today?`;
    case 'identity': return 'I am ROCKY AI, a holographic assistant. I run fully offline right now — no cloud model is connected until you add one in Settings.';
    case 'time': return `It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} right now.`;
    case 'date': return `Today is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    case 'help': return 'Offline, I can: chat, remember your name and notes, plan a task step by step, and create or edit text files in the Tasks panel. To get a real cloud model, add an OpenAI-compatible endpoint and key in Settings — it stays only on your device.';
    case 'remember': {
      const m = text.match(/(?:my name is|je m'appelle|اسمي)\s+(.+)/i);
      return m ? `Noted — I will remember you as ${m[1].trim()}.` : 'Tell me what to remember, for example: "my name is Oussama".';
    }
    case 'thanks': return 'You are welcome. Precision, no noise — that is the deal.';
    default: return 'Understood. In offline mode I reason from built-in rules only — I do not pretend to be a cloud model. Ask me for help, the time, or a task plan, or connect a model in Settings for open-ended answers.';
  }
}

export function planTask(goal: string): string[] {
  const g = goal.trim();
  if (!g) return [];
  return [
    `Clarify the goal: ${g}`,
    'Break it into the smallest shippable steps',
    'Create the first file or draft',
    'Review it, fix what is wrong, then ship it',
  ];
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
