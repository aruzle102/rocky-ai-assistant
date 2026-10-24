import { describe, it, expect, vi } from 'vitest';
import { localReply, detectIntent, planTask, evalArithmetic, convertUnits, parseLocalCommand, freeReply, DEFAULT_PROFILE } from '../rocky/brain';
import { TaskStore, needsConfirmation, isUnsupportedAction } from '../rocky/tasks';
import { pickVoiceForLang } from '../rocky/audio';

describe('brain local assistant', () => {
  it('greets and identifies itself as local, not a cloud model', () => {
    expect(detectIntent('hello Rocky')).toBe('greeting');
    expect(localReply('who are you?', DEFAULT_PROFILE)).toMatch(/local/i);
  });
  it('answers time/date without a network model', () => {
    const d = new Date('2026-10-24T12:00:00');
    expect(localReply('what time is it?', DEFAULT_PROFILE, d)).toMatch(/12:00/);
    expect(localReply('what is the date today?', DEFAULT_PROFILE, d)).toMatch(/2026/);
  });
  it('calculates safely without eval', () => {
    expect(evalArithmetic('17 + 25')).toBe(42);
    expect(evalArithmetic('(3 + 4) * 2')).toBe(14);
    expect(evalArithmetic('10 / 0')).toBeNull();
    expect(localReply('what is 17 + 25?', DEFAULT_PROFILE)).toMatch(/42/);
  });
  it('converts units', () => {
    expect(convertUnits('convert 10 km to miles')).toMatch(/6\.21/);
    expect(convertUnits('convert 20 c to f')).toMatch(/68/);
    expect(localReply('convert 10 km to miles', DEFAULT_PROFILE)).toMatch(/miles/);
  });
  it('parses real local commands', () => {
    expect(parseLocalCommand('my name is Oussama')).toEqual({ kind: 'remember-name', name: 'Oussama' });
    expect(parseLocalCommand('create file notes.txt with hello world')).toEqual({ kind: 'file', name: 'notes.txt', content: 'hello world' });
    expect(parseLocalCommand('hello there')).toEqual({ kind: 'none' });
  });
  it('plans a task in steps', () => {
    const steps = planTask('build a landing page');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]).toMatch(/landing page/);
  });
  it('translates core replies (fr/ar, partial i18n)', () => {
    expect(localReply('hello', DEFAULT_PROFILE, new Date(), 'fr')).toMatch(/Bonjour/);
    expect(localReply('hello', DEFAULT_PROFILE, new Date(), 'ar')).toMatch(/مرحباً/);
  });
  it('free endpoint builds a no-key GET request and returns model text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'mocked model answer' });
    vi.stubGlobal('fetch', fetchMock);
    const out = await freeReply([{ role: 'user', text: 'hello', at: 0, mode: 'free' }], new AbortController().signal, 'en');
    expect(out).toBe('mocked model answer');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/^https:\/\/text\.pollinations\.ai\//);
    expect(url).not.toMatch(/api[_-]?key|sk-/i);
    vi.unstubAllGlobals();
  });
});

describe('task store', () => {
  it('creates, lists and deletes files; destructive actions need confirmation', () => {
    const s = new TaskStore();
    s.createFile('a.txt', 'hello');
    expect(s.listFiles().some((f) => f.name === 'a.txt')).toBe(true);
    expect(needsConfirmation('delete file')).toBe(true);
    expect(needsConfirmation('create file')).toBe(false);
    expect(s.deleteFile('a.txt')).toBe(true);
    const t = s.addTask('demo');
    s.setTask(t.id, 'done', 'ok');
    expect(s.tasks[0].status).toBe('done');
  });
  it('plans stay PENDING until steps are executed step-by-step', () => {
    const s = new TaskStore();
    const t = s.addTaskWithSteps('plan: demo', ['Clarify', 'Create the first file for: demo']);
    expect(t.status).toBe('queued');
    expect(t.steps?.every((x) => x.status === 'pending')).toBe(true);
    s.setStep(t.id, 0, 'done', 'reviewed');
    expect(s.tasks.find((x) => x.id === t.id)?.steps?.[0].status).toBe('done');
    expect(s.tasks.find((x) => x.id === t.id)?.steps?.[1].status).toBe('pending');
    s.setStep(t.id, 1, 'failed', 'nope');
    expect(s.tasks.find((x) => x.id === t.id)?.steps?.[1].status).toBe('failed');
  });
  it('flags unsupported phone actions, but not in-app file deletion', () => {
    expect(isUnsupportedAction('send an sms to my friend')).toMatch(/SMS/);
    expect(isUnsupportedAction('buy a new phone')).toMatch(/Purchases/);
    expect(isUnsupportedAction('call 0612345678')).toMatch(/calls/);
    expect(isUnsupportedAction('delete file notes.txt')).toBeNull();
    expect(isUnsupportedAction('create file a.txt')).toBeNull();
  });
});

describe('voice picking', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Microsoft Guy', lang: 'en-US' },
    { name: 'Google français', lang: 'fr-FR' },
  ] as SpeechSynthesisVoice[];
  it('prefers the exact user-picked voice', () => {
    expect(pickVoiceForLang(voices, 'en-US', 'Google US English')?.name).toBe('Google US English');
  });
  it('prefers a male-sounding voice in the reply language', () => {
    expect(pickVoiceForLang(voices, 'en-US', '')?.name).toBe('Microsoft Guy');
    expect(pickVoiceForLang(voices, 'fr-FR', '')?.lang).toBe('fr-FR');
  });
});
