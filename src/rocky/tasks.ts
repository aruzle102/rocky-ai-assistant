/** Real task executor: files + task history.
 * Storage: in-app virtual store persisted in localStorage (Android sandbox:
 * the app cannot touch arbitrary phone files, SMS, calls or purchases).
 * Proposed actions are never executed until confirmed for destructive ones.
 * A plan creates a PENDING task; it is only marked done step-by-step as
 * steps actually complete — v1 wrongly marked plans done instantly. */

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'done' | 'failed';
export interface TaskStep { text: string; status: StepStatus; detail: string }
export interface TaskItem { id: string; title: string; status: TaskStatus; detail: string; createdAt: number; steps?: TaskStep[] }
export interface VirtualFile { name: string; content: string; updatedAt: number }

const LS_KEY = 'rocky-files-v1';
const TASK_KEY = 'rocky-tasks-v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full/blocked */ } }

export class TaskStore {
  files: VirtualFile[] = load<VirtualFile[]>(LS_KEY, []);
  tasks: TaskItem[] = load<TaskItem[]>(TASK_KEY, []);

  listFiles(): VirtualFile[] { return [...this.files].sort((a, b) => b.updatedAt - a.updatedAt); }

  createFile(name: string, content: string): VirtualFile {
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'untitled.txt';
    const existing = this.files.find((f) => f.name === clean);
    const file: VirtualFile = { name: clean, content, updatedAt: Date.now() };
    this.files = existing ? this.files.map((f) => (f.name === clean ? file : f)) : [...this.files, file];
    save(LS_KEY, this.files);
    return file;
  }

  deleteFile(name: string): boolean {
    const before = this.files.length;
    this.files = this.files.filter((f) => f.name !== name);
    save(LS_KEY, this.files);
    return this.files.length < before;
  }

  addTask(title: string): TaskItem {
    const t: TaskItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, status: 'queued', detail: '', createdAt: Date.now() };
    this.tasks = [t, ...this.tasks];
    save(TASK_KEY, this.tasks);
    return t;
  }

  addTaskWithSteps(title: string, steps: string[]): TaskItem {
    const t = this.addTask(title);
    t.steps = steps.map((text) => ({ text, status: 'pending' as StepStatus, detail: '' }));
    t.detail = 'PENDING — plan created, nothing executed yet.';
    this.tasks = this.tasks.map((x) => (x.id === t.id ? t : x));
    save(TASK_KEY, this.tasks);
    return t;
  }

  setTask(id: string, status: TaskStatus, detail = '') {
    this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, status, detail } : t));
    save(TASK_KEY, this.tasks);
  }

  setStep(id: string, index: number, status: StepStatus, detail = '') {
    this.tasks = this.tasks.map((t) => {
      if (t.id !== id || !t.steps || !t.steps[index]) return t;
      const steps = t.steps.map((s, i) => (i === index ? { ...s, status, detail } : s));
      return { ...t, steps };
    });
    save(TASK_KEY, this.tasks);
  }

  /** Resume: queued/running tasks go back to queued so they can be re-run. */
  resumeInterrupted(): number {
    let n = 0;
    this.tasks = this.tasks.map((t) => {
      if (t.status === 'running') { n++; return { ...t, status: 'queued' as TaskStatus, detail: 'Resumed after interruption' }; }
      return t;
    });
    save(TASK_KEY, this.tasks);
    return n;
  }
}

export const DESTRUCTIVE_ACTIONS = ['delete', 'send', 'publish'] as const;
export function needsConfirmation(action: string): boolean {
  return DESTRUCTIVE_ACTIONS.some((d) => action.toLowerCase().includes(d));
}

/** Actions the Android sandbox + this app genuinely cannot do. These must
 * NEVER be reported as done. Deleting a file inside the app's own store is
 * supported (with confirmation) and is deliberately not in this list. */
export function isUnsupportedAction(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bsend\b.*\b(sms|text message|whatsapp|email|mail)\b/.test(t)) return 'Sending SMS, email or WhatsApp messages is not available from this app.';
  if (/\b(call|phone|dial)\b.*\b\d/.test(t) || /\bcall (me|him|her|them|my|a|the)\b/.test(t)) return 'Placing phone calls is not available from this app.';
  if (/\b(buy|purchase|order|pay for)\b/.test(t)) return 'Purchases and payments are not available from this app.';
  if (/\b(delete|remove)\b.*\b(my )?(photos?|contacts?|messages|apps?)\b/.test(t) && !t.includes('file')) return 'Deleting phone photos, contacts or other apps is not available — Android sandbox rules apply.';
  if (/\b(access|read|open)\b.*\b(my )?(photos?|contacts?|gallery)\b/.test(t)) return 'Accessing phone photos or contacts is not available from this app.';
  return null;
}
