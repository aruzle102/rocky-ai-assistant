import { describe, it, expect } from 'vitest';
import { localReply, detectIntent, planTask, DEFAULT_PROFILE } from '../rocky/brain';
import { TaskStore, needsConfirmation } from '../rocky/tasks';

describe('brain state machine', () => {
  it('greets and identifies itself as offline', () => {
    expect(detectIntent('hello Rocky')).toBe('greeting');
    expect(localReply('who are you?', DEFAULT_PROFILE)).toMatch(/offline/i);
  });
  it('answers time/date without a network model', () => {
    const d = new Date('2026-10-24T12:00:00');
    expect(localReply('what time is it?', DEFAULT_PROFILE, d)).toMatch(/12:00/);
    expect(localReply('what is the date today?', DEFAULT_PROFILE, d)).toMatch(/2026/);
  });
  it('plans a task in steps', () => {
    const steps = planTask('build a landing page');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]).toMatch(/landing page/);
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
});
