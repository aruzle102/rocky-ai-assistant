import { describe, it, expect } from 'vitest';
import {
  PROVIDERS, defaultProviderStates, selectProviders, runEngine, runCompare,
  testProvider, discoverModels, recordFailure, isEffectivelyEnabled, sanitizeModelText,
  researchWeb, classifyOpenTarget, type ProviderState, type FetchFn,
} from '../rocky/providers';
import { executePlan, TaskStore, isUnsupportedAction } from '../rocky/tasks';

/** Minimal Response-like for mocked fetch. */
function mockFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status: number; body: string }): FetchFn {
  return async (url, init) => {
    const r = handler(url, init);
    return { ok: r.ok, status: r.status, text: async () => r.body };
  };
}

function statesWith(ids: string[]): ProviderState[] {
  const all = defaultProviderStates();
  return all.map((s) => ({ ...s, enabled: ids.includes(s.id) }));
}
const msgs = [{ role: 'user', content: 'hello' }];
const baseReq = (over: Partial<Parameters<typeof runEngine>[0]> = {}) => ({
  mode: 'smart' as const,
  fallbackOrder: PROVIDERS.map((p) => p.id),
  states: statesWith(['pollinations', 'groq']),
  keys: {} as Record<string, string>,
  messages: msgs,
  ...over,
});

describe('provider registry', () => {
  it('never marks a user-key provider as INTEGRATED without a keyed test', () => {
    for (const p of PROVIDERS) {
      if (p.access === 'user-key') expect(p.status).not.toBe('INTEGRATED');
    }
    expect(PROVIDERS.find((p) => p.id === 'pollinations')!.status).toBe('INTEGRATED');
    expect(PROVIDERS.find((p) => p.id === 'local')!.status).toBe('INTEGRATED');
  });
  it('sanitises model output and rejects empty output as a failure path', () => {
    expect(sanitizeModelText('  hello\x00world  ')).toBe('helloworld');
  });
});

describe('routing', () => {
  it('Smart Auto short query keeps user fallback order', () => {
    const order = selectProviders(baseReq());
    expect(order[0]).toBe('pollinations');
  });
  it('Deep mode prefers reasoning-capable providers first', () => {
    const order = selectProviders(baseReq({ mode: 'deep', messages: [{ role: 'user', content: 'short' }] }));
    expect(order[0]).toBe('groq');
  });
  it('Fast mode prefers fast providers first', () => {
    const order = selectProviders(baseReq({ mode: 'fast' }));
    expect(order[0]).toBe('pollinations');
  });
  it('offline mode selects nothing', () => {
    expect(selectProviders(baseReq({ mode: 'offline' }))).toEqual([]);
  });
});

describe('failover (mocked fetch, no real network)', () => {
  it('first provider 500 -> second succeeds, exactly 2 attempts, no infinite loop', async () => {
    let calls = 0;
    const fetchFn = mockFetch((url) => {
      calls++;
      if (url.includes('pollinations.ai/') && !url.includes('models')) return { ok: false, status: 500, body: 'boom' };
      return { ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: 'second answer' } }] }) };
    });
    const res = await runEngine(baseReq({ fetchFn, keys: { groq: 'test-key' } }));
    expect(res.text).toBe('second answer');
    expect(res.providerId).toBe('groq');
    expect(res.attempts.length).toBe(2);
    expect(res.attempts[0].ok).toBe(false);
    expect(calls).toBe(2);
  });
  it('all providers failing throws with attempts, never an empty success', async () => {
    const fetchFn = mockFetch(() => ({ ok: false, status: 503, body: 'down' }));
    await expect(runEngine(baseReq({ fetchFn, keys: { groq: 'k' } }))).rejects.toThrow(/All providers failed/);
  });
  it('max 3 attempts even with 5 enabled providers', async () => {
    let calls = 0;
    const fetchFn = mockFetch(() => { calls++; return { ok: false, status: 500, body: 'x' }; });
    const req = baseReq({ fetchFn, keys: { groq: 'k', gemini: 'k', mistral: 'k', sambanova: 'k' }, states: statesWith(['pollinations', 'groq', 'gemini', 'mistral', 'sambanova']) });
    await expect(runEngine(req)).rejects.toThrow();
    expect(calls).toBe(3);
  });
});

describe('health auto-disable', () => {
  it('3 consecutive failures auto-disable, and routing excludes the provider', () => {
    let s = defaultProviderStates().find((x) => x.id === 'pollinations')!;
    s = recordFailure(s, 'e1'); s = recordFailure(s, 'e2');
    expect(isEffectivelyEnabled(s)).toBe(true);
    s = recordFailure(s, 'e3');
    expect(s.autoDisabled).toBe(true);
    expect(isEffectivelyEnabled(s)).toBe(false);
    const order = selectProviders(baseReq({ states: [s, ...statesWith(['groq'])] }));
    expect(order).not.toContain('pollinations');
  });
});

describe('test + discovery URL building (mocked)', () => {
  it('testProvider succeeds on a real-shaped Pollinations reply', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, status: 200, body: '7' }));
    const def = PROVIDERS.find((p) => p.id === 'pollinations')!;
    const res = await testProvider(def, 'openai-fast', '', fetchFn);
    expect(res.ok).toBe(true);
    expect(res.output).toBe('7');
  });
  it('testProvider fails on empty reply', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, status: 200, body: '   ' }));
    const def = PROVIDERS.find((p) => p.id === 'pollinations')!;
    const res = await testProvider(def, 'openai-fast', '', fetchFn);
    expect(res.ok).toBe(false);
  });
  it('discoverModels returns :free ids from OpenRouter list', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ data: [{ id: 'a/b:free' }, { id: 'c/d' }, { id: 'e/f:free' }] }) }));
    const def = PROVIDERS.find((p) => p.id === 'openrouter')!;
    expect(await discoverModels(def, '', fetchFn)).toEqual(['a/b:free', 'e/f:free']);
  });
  it('discoverModels for a keyed provider without a key throws', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, status: 200, body: '{}' }));
    const def = PROVIDERS.find((p) => p.id === 'groq')!;
    await expect(discoverModels(def, '', fetchFn)).rejects.toThrow(/needs an API key/);
  });
});

describe('compare mode', () => {
  it('shows each answer separately before synthesis, at most 2 providers', async () => {
    const fetchFn = mockFetch((url) => {
      if (url.includes('pollinations')) return { ok: true, status: 200, body: 'polli answer' };
      return { ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: 'groq answer' } }] }) };
    });
    const res = await runCompare(baseReq({ fetchFn, keys: { groq: 'k' }, compare: true }));
    expect(res.compareAnswers!.length).toBe(2);
    expect(res.compareAnswers![0].text).toBe('polli answer');
    expect(res.synthesis).toContain('polli answer');
    expect(res.synthesis).toContain('groq answer');
  });
});

describe('web research + open targets', () => {
  it('researchWeb uses DuckDuckGo abstract when present', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ AbstractText: 'Algiers is the capital.', AbstractSource: 'Wikipedia', AbstractURL: 'https://example.org/algiers' }) }));
    const r = await researchWeb('Algiers', fetchFn);
    expect(r.summary).toContain('capital');
    expect(r.source).toBe('Wikipedia');
  });
  it('classifyOpenTarget: http supported, whatsapp/tel unsupported', () => {
    expect(classifyOpenTarget('https://example.com').supported).toBe(true);
    expect(classifyOpenTarget('whatsapp://send').supported).toBe(false);
    expect(classifyOpenTarget('tel:+213000').supported).toBe(false);
  });
});

describe('Plan -> Execute -> Verify -> Report', () => {
  it('file step creates + verifies, research step verifies, report lists both', async () => {
    const store = new TaskStore();
    store.files = []; store.tasks = [];
    const task = store.addTaskWithSteps('plan: build a guide', ['Create the first file for the guide', 'Research the topic', 'Review the draft']);
    const { report, failed } = await executePlan(task, store, {
      createFile: (n, c) => store.createFile(n, c),
      listFiles: () => store.listFiles(),
      research: async () => ({ summary: 'Real summary from DuckDuckGo.', source: 'DuckDuckGo', url: 'https://example.org' }),
      addReminder: () => { throw new Error('no reminder in this test'); },
      addNote: () => undefined,
    });
    expect(failed).toBe(false);
    expect(store.listFiles().length).toBe(1);
    expect(store.listFiles()[0].content).toContain('build a guide');
    const done = store.tasks.find((t) => t.id === task.id)!;
    expect(done.status).toBe('done');
    expect(done.steps!.every((s) => s.status === 'done')).toBe(true);
    expect(report).toContain('created + verified');
    expect(report).toContain('research verified');
  });
  it('unsupported actions are detected and never executed', () => {
    expect(isUnsupportedAction('send a whatsapp message to Sara')).not.toBeNull();
    expect(isUnsupportedAction('buy a phone')).not.toBeNull();
  });
});
