/** Multi-model provider engine for ROCKY AI v3.
 *
 * Status vocabulary — shown verbatim in the UI, never inflated:
 *  - DISCOVERED: listed in a directory/repo, not yet documented here.
 *  - DOCUMENTED: free tier + signup steps recorded from official docs or a
 *    maintained directory, with the date. Chat NOT yet tested with a key.
 *  - TESTED: a real request (chat or discovery) succeeded from this
 *    environment or from an in-app Test button, with latency recorded.
 *  - INTEGRATED: wired in the app AND a real test passed.
 * A provider is NEVER shown as operational without a successful real test.
 * Keys are held by the caller (App stores them in Capacitor Preferences
 * only); this module never logs, prints, or persists a key.
 *
 * Research date: 2026-10-24. Free lists change constantly — model IDs are
 * defaults the user can edit, and discovery (where the API allows it)
 * fetches the live list instead of trusting this file.
 */

export type ProviderStatus = 'DISCOVERED' | 'DOCUMENTED' | 'TESTED' | 'INTEGRATED';
export type ProviderAccess = 'keyless' | 'user-key' | 'local';
export type Capability = 'general' | 'reasoning' | 'coding' | 'summarise' | 'fast';
export type EngineMode = 'smart' | 'fast' | 'deep' | 'offline';

export interface ProviderDef {
  id: string;
  name: string;
  access: ProviderAccess;
  status: ProviderStatus;
  /** OpenAI-compatible base URL, or '' for local/keyless-GET providers. */
  baseUrl: string;
  /** Default model id (editable in Settings; discovery may replace it). */
  defaultModel: string;
  capabilities: Capability[];
  signupUrl: string;
  setupSteps: string[];
  /** Free limits AS DOCUMENTED on 2026-10-24 — not measured quotas. */
  freeLimits: string;
  regionNote: string;
  /** True when model discovery works without a key. */
  discoverableWithoutKey: boolean;
  /** True when chat works without a key. */
  keylessChat: boolean;
  /** Extra note shown in Settings (privacy, verification, card, …). */
  note: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'pollinations', name: 'Pollinations (free public)', access: 'keyless', status: 'INTEGRATED',
    baseUrl: 'https://text.pollinations.ai', defaultModel: 'openai-fast',
    capabilities: ['general', 'fast'],
    signupUrl: 'No signup — https://pollinations.ai/',
    setupSteps: ['No account, no key. Just enable it in the provider list.'],
    freeLimits: 'No key, anonymous tier. Rate-limited; exact numbers are not published. Tested 2026-10-24: GET 200 in ~1–6 s. May change or disappear without notice.',
    regionNote: 'Algeria access NOT verified from Algeria (tested from the build VM only) — confirm on the phone.',
    discoverableWithoutKey: true, keylessChat: true,
    note: 'NOT PRIVATE: your prompt is sent in a URL to a public service. Never send sensitive information in this mode. Off by default in v2; in v3 Smart Auto it is enabled by default with this warning visible, and can be disabled in one tap.',
  },
  {
    id: 'openrouter', name: 'OpenRouter (:free models)', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'google/gemma-4-31b-it:free',
    capabilities: ['general', 'reasoning', 'coding'],
    signupUrl: 'https://openrouter.ai/keys',
    setupSteps: ['Create a free OpenRouter account.', 'Create an API key at openrouter.ai/keys.', 'Paste the key in ROCKY, then tap Discover models to list live :free models.'],
    freeLimits: 'As documented 2026-10-24 (free-inference README + OpenRouter docs via directories): :free models at ~20 requests/min, ~50 requests/day, rising to ~1000/day after a $10 credit purchase (paid, not required). Model list changes frequently — use Discover, do not trust a static list.',
    regionNote: 'Algeria access NOT verified from Algeria — confirm on the phone.',
    discoverableWithoutKey: true, keylessChat: false,
    note: 'Discovery TESTED 2026-10-24: GET /models returned HTTP 200 with 17 :free model ids (see BUILD_REPORT). Chat was NOT tested (needs a key) — status stays DOCUMENTED until a keyed test passes in-app.',
  },
  {
    id: 'gemini', name: 'Google Gemini (AI Studio)', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', defaultModel: 'gemini-2.5-flash',
    capabilities: ['general', 'reasoning', 'summarise'],
    signupUrl: 'https://aistudio.google.com/',
    setupSteps: ['Open Google AI Studio and sign in with a Google account.', 'Create an API key (Get API key).', 'Paste the key in ROCKY. No card is needed for the free tier.'],
    freeLimits: 'As documented 2026-10-24: free tier on Flash/Flash-Lite models, limits shown in AI Studio and varying by model and account age (secondary sources quote e.g. 500 requests/day for Flash-Lite class models, 20/day for newer Flash class — verify in your own AI Studio dashboard; do not rely on these numbers). Free-tier content may be used by Google to improve its products.',
    regionNote: 'Algeria access NOT verified from Algeria — confirm on the phone. Gemini availability varies by region.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'OpenAI-compatible endpoint (…/v1beta/openai/). Model ids change between generations (2.5 vs 3.x in different directories) — Discover or type the exact id shown in AI Studio.',
  },
  {
    id: 'groq', name: 'Groq', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'openai/gpt-oss-120b',
    capabilities: ['general', 'reasoning', 'fast'],
    signupUrl: 'https://console.groq.com/keys',
    setupSteps: ['Sign up at console.groq.com with an email (no card for the free tier, per directories).', 'Create an API key.', 'Paste the key in ROCKY.'],
    freeLimits: 'As documented 2026-10-24 (free-inference README): rate-limited free tier, limits per model shown in the Groq console and in x-ratelimit-* response headers; secondary sources quote ~30 requests/min and ~1000 requests/day on gpt-oss-120b. Verify in your own console.',
    regionNote: 'Algeria access NOT verified from Algeria — confirm on the phone.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'Fastest time-to-first-token of the documented providers (LPU hardware) — good Fast-mode candidate once a key is added.',
  },
  {
    id: 'mistral', name: 'Mistral (La Plateforme)', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest',
    capabilities: ['general', 'coding'],
    signupUrl: 'https://console.mistral.ai/',
    setupSteps: ['Create a Mistral account (phone/SMS verification required, no card for the Experiment tier, per directories).', 'Create an API key in the console.', 'Paste the key in ROCKY.'],
    freeLimits: 'As documented 2026-10-24: Experiment/free tier with usage and rate limits shown in the admin console Limits panel; exact numbers are no longer published in the docs. Evaluation tier, not production.',
    regionNote: 'Algeria access NOT verified from Algeria; SMS verification availability in Algeria is unconfirmed — confirm on the phone.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'Good for coding (Codestral family) once a key is added.',
  },
  {
    id: 'cloudflare', name: 'Cloudflare Workers AI', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', defaultModel: '@cf/meta/llama-3-8b-instruct',
    capabilities: ['general', 'fast'],
    signupUrl: 'https://dash.cloudflare.com/',
    setupSteps: ['Create a free Cloudflare account and note your Account ID.', 'Create an API token with Workers AI access.', 'In ROCKY, replace {account_id} in the base URL with your Account ID and paste the token as the key.'],
    freeLimits: 'As documented 2026-10-24: ~10,000 Neurons/day (normalised GPU-compute units, shared across models, resets 00:00 UTC); hard stop when exhausted, no overage. No card, per directories.',
    regionNote: 'Algeria access NOT verified from Algeria — confirm on the phone.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'Base URL is a template — it does not work until {account_id} is replaced. The app warns about this in Settings.',
  },
  {
    id: 'sambanova', name: 'SambaNova Cloud', access: 'user-key', status: 'DOCUMENTED',
    baseUrl: 'https://api.sambanova.ai/v1', defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    capabilities: ['general', 'reasoning'],
    signupUrl: 'https://cloud.sambanova.ai/',
    setupSteps: ['Create a free SambaNova Cloud account (no card, no phone verification, per directories).', 'Create an API key.', 'Paste the key in ROCKY.'],
    freeLimits: 'As documented 2026-10-24: rate-limited free tier; secondary sources quote ~20 requests/min, ~20 requests/day, ~200K tokens/day per model. Preview models can be withdrawn at any time. Verify in your own console.',
    regionNote: 'Algeria access NOT verified from Algeria — confirm on the phone.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'OpenAI-compatible base URL. Model ids are examples from the directory — Discover or type the exact id from your console.',
  },
  {
    id: 'local', name: 'Local assistant (on-device tools)', access: 'local', status: 'INTEGRATED',
    baseUrl: '', defaultModel: 'local-tools',
    capabilities: ['general', 'fast'],
    signupUrl: '',
    setupSteps: ['No signup, no key, no network. Always available.'],
    freeLimits: 'No quota — runs on the phone. Limited to built-in tools (time, calculator, conversions, city times, memory, plans, files). Not a language model.',
    regionNote: 'Works everywhere, including fully offline.',
    discoverableWithoutKey: false, keylessChat: false,
    note: 'Never presented as a model. Used for Offline mode and as the honest fallback when every cloud provider fails.',
  },
];

export function providerDef(id: string): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

/** Persisted, key-free provider state (keys live separately in Preferences). */
export interface ProviderState {
  id: string;
  enabled: boolean;
  model: string;
  /** Discovered model ids (empty until Discover runs). */
  models: string[];
  lastTestAt: number | null;
  lastLatencyMs: number | null;
  successes: number;
  errors: number;
  lastError: string;
  consecutiveFailures: number;
  autoDisabled: boolean;
  /** True when a real chat/discovery test passed for THIS provider. */
  tested: boolean;
}

export function defaultProviderState(def: ProviderDef): ProviderState {
  return {
    id: def.id, enabled: def.id === 'pollinations' || def.id === 'local',
    model: def.defaultModel, models: [],
    lastTestAt: null, lastLatencyMs: null, successes: 0, errors: 0,
    lastError: '', consecutiveFailures: 0, autoDisabled: false,
    tested: def.id === 'pollinations' || def.id === 'local',
  };
}

export function defaultProviderStates(): ProviderState[] {
  return PROVIDERS.map(defaultProviderState);
}

/** Health tracking: success resets the failure streak; 3 consecutive
 * failures auto-disable the provider (caller must surface the banner). */
export function recordSuccess(s: ProviderState, latencyMs: number): ProviderState {
  return { ...s, successes: s.successes + 1, consecutiveFailures: 0, autoDisabled: false, lastLatencyMs: latencyMs, lastTestAt: Date.now(), lastError: '', tested: true };
}
export function recordFailure(s: ProviderState, message: string): ProviderState {
  const consecutiveFailures = s.consecutiveFailures + 1;
  return { ...s, errors: s.errors + 1, consecutiveFailures, autoDisabled: consecutiveFailures >= 3, lastError: message.slice(0, 300), lastTestAt: Date.now() };
}
export function isEffectivelyEnabled(s: ProviderState): boolean {
  return s.enabled && !s.autoDisabled;
}

/* ---------- low-level calls (fetch is injectable for tests) ---------- */

export type FetchFn = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const defaultFetch: FetchFn = (url, init) => fetch(url, init) as Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

/** Sanitise model output before rendering: trim, drop control chars,
 * cap length. React renders text (never raw HTML), so this is defence in
 * depth, not the only protection. Empty output is a failure, never a reply. */
export function sanitizeModelText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 8000);
}

export async function callProviderChat(
  def: ProviderDef, model: string, messages: { role: string; content: string }[],
  apiKey: string, fetchFn: FetchFn = defaultFetch, signal?: AbortSignal, timeoutMs = 30000,
): Promise<string> {
  if (def.id === 'local') throw new Error('Local provider has no chat endpoint — use local tools.');
  if (def.id === 'pollinations') {
    const history = messages.slice(-6).map((m) => `${m.role === 'assistant' ? 'ROCKY' : 'User'}: ${m.content}`).join('\n').slice(-1500);
    const url = `https://text.pollinations.ai/${encodeURIComponent(history)}`;
    const { signal: sig, cancel } = withTimeout(signal, timeoutMs);
    try {
      const res = await fetchFn(url, { signal: sig });
      if (!res.ok) throw new Error(`Pollinations returned HTTP ${res.status}.`);
      const text = sanitizeModelText(await res.text());
      if (!text) throw new Error('Pollinations returned an empty reply.');
      return text;
    } finally { cancel(); }
  }
  if (!apiKey) throw new Error(`${def.name} needs an API key — add one in Settings, then tap Test.`);
  const base = def.baseUrl.replace(/\/$/, '');
  if (base.includes('{account_id}')) throw new Error('Cloudflare base URL still contains {account_id} — replace it with your real Account ID in Settings.');
  const url = `${base}/chat/completions`;
  const { signal: sig, cancel } = withTimeout(signal, timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'POST', signal: sig,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1200 }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = (JSON.parse(raw).error?.message as string) || ''; } catch { /* ignore */ }
      throw new Error(`${def.name} returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`);
    }
    let parsed: { choices?: { message?: { content?: string } }[] };
    try { parsed = JSON.parse(raw); } catch { throw new Error(`${def.name} returned invalid JSON.`); }
    const text = sanitizeModelText(parsed.choices?.[0]?.message?.content || '');
    if (!text) throw new Error(`${def.name} returned an empty reply.`);
    return text;
  } finally { cancel(); }
}

/** Discover models. Keyless where the API allows it; otherwise needs a key.
 * Returns model ids (for Pollinations: the single model from /models). */
export async function discoverModels(
  def: ProviderDef, apiKey: string, fetchFn: FetchFn = defaultFetch, signal?: AbortSignal,
): Promise<string[]> {
  if (def.id === 'local') return ['local-tools'];
  if (def.id === 'pollinations') {
    const { signal: sig, cancel } = withTimeout(signal, 30000);
    try {
      const res = await fetchFn('https://text.pollinations.ai/models', { signal: sig });
      if (!res.ok) throw new Error(`Pollinations models returned HTTP ${res.status}.`);
      const data = JSON.parse(await res.text());
      const names = (Array.isArray(data) ? data : []).map((m) => m.name).filter(Boolean) as string[];
      if (!names.length) throw new Error('Pollinations returned no models.');
      return names;
    } finally { cancel(); }
  }
  if (def.id === 'openrouter') {
    const { signal: sig, cancel } = withTimeout(signal, 30000);
    try {
      const res = await fetchFn('https://openrouter.ai/api/v1/models', { signal: sig });
      if (!res.ok) throw new Error(`OpenRouter models returned HTTP ${res.status}.`);
      const data = JSON.parse(await res.text());
      const ids = (data.data || []).map((m: { id: string }) => m.id).filter(Boolean) as string[];
      const free = ids.filter((id) => id.endsWith(':free'));
      return free.length ? free : ids;
    } finally { cancel(); }
  }
  if (!apiKey) throw new Error(`${def.name} model discovery needs an API key.`);
  const base = def.baseUrl.replace(/\/$/, '');
  if (base.includes('{account_id}')) throw new Error('Cloudflare base URL still contains {account_id}.');
  const { signal: sig, cancel } = withTimeout(signal, 30000);
  try {
    const res = await fetchFn(`${base}/models`, { signal: sig, headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`${def.name} models returned HTTP ${res.status}.`);
    const data = JSON.parse(await res.text());
    const ids = (data.data || []).map((m: { id: string }) => m.id).filter(Boolean) as string[];
    if (!ids.length) throw new Error(`${def.name} returned no models.`);
    return ids;
  } finally { cancel(); }
}

/** A real test call: short prompt, real provider, latency + output recorded.
 * Never returns success on an empty or invalid reply. */
export async function testProvider(
  def: ProviderDef, model: string, apiKey: string, fetchFn: FetchFn = defaultFetch, signal?: AbortSignal,
): Promise<{ ok: boolean; latencyMs: number; output: string; error: string }> {
  const t0 = Date.now();
  try {
    const out = await callProviderChat(def, model, [{ role: 'user', content: 'What is 3 plus 4? Answer with the number only.' }], apiKey, fetchFn, signal, 30000);
    return { ok: true, latencyMs: Date.now() - t0, output: out.slice(0, 300), error: '' };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, output: '', error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/* ---------- routing + failover engine ---------- */

export interface EngineRequest {
  mode: EngineMode;
  /** Ordered fallback provider ids chosen by the user (subset of registry). */
  fallbackOrder: string[];
  states: ProviderState[];
  keys: Record<string, string>;
  messages: { role: string; content: string }[];
  capability?: Capability;
  compare?: boolean;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
}

export interface Attempt { providerId: string; model: string; ok: boolean; latencyMs: number; error: string }
export interface EngineResult {
  text: string;
  providerId: string;
  model: string;
  latencyMs: number;
  attempts: Attempt[];
  /** New provider states after health updates (caller must persist). */
  states: ProviderState[];
  /** Compare mode only: per-provider answers, then a local synthesis. */
  compareAnswers?: { providerId: string; model: string; text: string; latencyMs: number }[];
  synthesis?: string;
}

function isLongOrComplex(messages: { content: string }[]): boolean {
  const last = messages[messages.length - 1]?.content || '';
  return last.length > 800 || /(reason|analyse|analyze|explain in depth|debug|proof|architecture|design a|plan a system)/i.test(last);
}

/** Ordered provider ids for a request. Pure function — fully unit-testable. */
export function selectProviders(req: EngineRequest): string[] {
  const byId = new Map(req.states.map((s) => [s.id, s]));
  const enabled = req.fallbackOrder
    .map((id) => byId.get(id))
    .filter((s): s is ProviderState => !!s && isEffectivelyEnabled(s) && s.id !== 'local');
  if (req.mode === 'offline') return [];
  const long = isLongOrComplex(req.messages);
  const reasoningFirst = (list: ProviderState[]) => [...list].sort((a, b) => {
    const ra = providerDef(a.id).capabilities.includes('reasoning') ? 0 : 1;
    const rb = providerDef(b.id).capabilities.includes('reasoning') ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.lastLatencyMs ?? 99999) - (b.lastLatencyMs ?? 99999);
  });
  const fastFirst = (list: ProviderState[]) => [...list].sort((a, b) => {
    const fa = providerDef(a.id).capabilities.includes('fast') ? 0 : 1;
    const fb = providerDef(b.id).capabilities.includes('fast') ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (a.lastLatencyMs ?? 99999) - (b.lastLatencyMs ?? 99999);
  });
  let ordered: ProviderState[];
  if (req.mode === 'deep' || (req.mode === 'smart' && long) || req.capability === 'reasoning' || req.capability === 'coding') ordered = reasoningFirst(enabled);
  else if (req.mode === 'fast') ordered = fastFirst(enabled);
  else ordered = enabled; // Smart Auto, short queries: user's fallback order
  return ordered.map((s) => s.id);
}

function updateStates(states: ProviderState[], id: string, fn: (s: ProviderState) => ProviderState): ProviderState[] {
  return states.map((s) => (s.id === id ? fn(s) : s));
}

/** Smart/Fast/Deep request with bounded failover: at most 3 attempts
 * (primary + 2 fallbacks), no infinite retries, no duplicate calls. */
export async function runEngine(req: EngineRequest): Promise<EngineResult> {
  const fetchFn = req.fetchFn || defaultFetch;
  const ordered = selectProviders(req);
  if (!ordered.length) throw new Error('No enabled provider available. Enable a provider in Settings, or switch to Offline mode.');
  const attempts: Attempt[] = [];
  let states = req.states;
  const tried = ordered.slice(0, 3);
  for (const id of tried) {
    const def = providerDef(id);
    const st = states.find((s) => s.id === id)!;
    const t0 = Date.now();
    try {
      const text = await callProviderChat(def, st.model, req.messages, req.keys[id] || '', fetchFn, req.signal, 30000);
      const latency = Date.now() - t0;
      attempts.push({ providerId: id, model: st.model, ok: true, latencyMs: latency, error: '' });
      states = updateStates(states, id, (s) => recordSuccess(s, latency));
      return { text, providerId: id, model: st.model, latencyMs: latency, attempts, states };
    } catch (e) {
      const latency = Date.now() - t0;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      attempts.push({ providerId: id, model: st.model, ok: false, latencyMs: latency, error: msg });
      states = updateStates(states, id, (s) => recordFailure(s, msg));
      if (req.signal?.aborted) break;
    }
  }
  const summary = attempts.map((a) => `${a.providerId}: ${a.error}`).join(' | ');
  const err = new Error(`All providers failed (${attempts.length} attempt${attempts.length === 1 ? '' : 's'}): ${summary}`) as Error & { attempts: Attempt[]; states: ProviderState[] };
  err.attempts = attempts; err.states = states;
  throw err;
}

/** Compare mode: at most 2 providers in parallel, answers shown separately,
 * then a LOCAL synthesis (attributed joining, not a third model call, so
 * Compare never silently spends a third request). */
export async function runCompare(req: EngineRequest): Promise<EngineResult> {
  const fetchFn = req.fetchFn || defaultFetch;
  const ordered = selectProviders(req).slice(0, 2);
  if (ordered.length < 2) throw new Error('Compare needs at least 2 enabled providers. Enable another provider in Settings.');
  let states = req.states;
  const settled = await Promise.all(ordered.map(async (id) => {
    const def = providerDef(id);
    const st = states.find((s) => s.id === id)!;
    const t0 = Date.now();
    try {
      const text = await callProviderChat(def, st.model, req.messages, req.keys[id] || '', fetchFn, req.signal, 30000);
      return { id, model: st.model, text, latency: Date.now() - t0, error: '' };
    } catch (e) {
      return { id, model: st.model, text: '', latency: Date.now() - t0, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }));
  const attempts: Attempt[] = [];
  const answers: { providerId: string; model: string; text: string; latencyMs: number }[] = [];
  for (const r of settled) {
    attempts.push({ providerId: r.id, model: r.model, ok: !r.error, latencyMs: r.latency, error: r.error });
    states = updateStates(states, r.id, (s) => (r.error ? recordFailure(s, r.error) : recordSuccess(s, r.latency)));
    if (!r.error) answers.push({ providerId: r.id, model: r.model, text: r.text, latencyMs: r.latency });
  }
  if (!answers.length) throw new Error(`Compare failed on every provider: ${attempts.map((a) => `${a.providerId}: ${a.error}`).join(' | ')}`);
  const synthesis = answers.map((a) => `${providerDef(a.providerId).name} (${a.model}, ${a.latencyMs}ms): ${a.text.slice(0, 600)}`).join('\n\n');
  const first = answers[0];
  return {
    text: synthesis, providerId: first.providerId, model: first.model,
    latencyMs: Math.max(...answers.map((a) => a.latencyMs)), attempts, states,
    compareAnswers: answers, synthesis,
  };
}

/* ---------- web research tool (DuckDuckGo, Wikipedia fallback) ---------- */

export interface ResearchResult { summary: string; source: string; url: string }

export async function researchWeb(query: string, fetchFn: FetchFn = defaultFetch, signal?: AbortSignal): Promise<ResearchResult> {
  const q = query.trim();
  if (!q) throw new Error('Empty research query.');
  const { signal: sig, cancel } = withTimeout(signal, 30000);
  try {
    const ddg = await fetchFn(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, { signal: sig });
    if (ddg.ok) {
      const data = JSON.parse(await ddg.text());
      const abstract = (data.AbstractText || data.Abstract || '').trim();
      if (abstract) return { summary: abstract.slice(0, 1200), source: data.AbstractSource || 'DuckDuckGo Instant Answer', url: data.AbstractURL || '' };
      const related = (data.RelatedTopics || []).find((t: { Text?: string }) => t.Text);
      if (related?.Text) return { summary: (related.Text as string).slice(0, 1200), source: 'DuckDuckGo Instant Answer', url: related.FirstURL || '' };
    }
    // Wikipedia action API (the REST summary endpoint 403s without a UA).
    const wiki = await fetchFn(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${encodeURIComponent(q)}`, { signal: sig, headers: { 'User-Agent': 'ROCKY-AI/1.0' } });
    if (!wiki.ok) throw new Error(`Web research failed: DuckDuckGo returned no result and Wikipedia returned HTTP ${wiki.status}.`);
    const data = JSON.parse(await wiki.text());
    const pages = Object.values(data.query?.pages || {}) as { extract?: string; title?: string }[];
    const extract = pages.find((p) => p.extract)?.extract?.trim();
    if (!extract) throw new Error('Web research found no summary for this query.');
    return { summary: extract.slice(0, 1200), source: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/\s+/g, '_'))}` };
  } finally { cancel(); }
}

/** Open a URL/app: http(s) links are supported (opened by the app shell);
 * everything else is UNSUPPORTED with a reason — never fake success. */
export function classifyOpenTarget(target: string): { supported: boolean; kind: string; detail: string } {
  const t = target.trim();
  if (/^https?:\/\//i.test(t)) return { supported: true, kind: 'open-link', detail: `Link: ${t}` };
  if (/^(tel:|sms:|whatsapp:|mailto:)/i.test(t)) return { supported: false, kind: 'unsupported', detail: 'Calls, SMS, WhatsApp and email are not available from this app.' };
  return { supported: false, kind: 'unsupported', detail: 'Opening other apps is not available from this app — only http(s) links can be opened.' };
}
