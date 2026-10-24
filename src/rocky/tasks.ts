/** Real task executor: files + task history.
 * Storage: Capacitor Filesystem when available, else a virtual store
 * persisted in localStorage. Proposed actions are never executed until
 * the user confirms destructive ones (delete/send/publish). */

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface TaskItem { id: string; title: string; status: TaskStatus; detail: string; createdAt: number }
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

  setTask(id: string, status: TaskStatus, detail = '') {
    this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, status, detail } : t));
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
