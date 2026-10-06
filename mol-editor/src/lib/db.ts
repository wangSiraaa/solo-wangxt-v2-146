// IndexedDB 工程持久化（无后端）。存储原始输入草稿与当前分子图。
import type { Project } from '../editor/types';

const DB_NAME = 'mol-editor-db';
const STORE = 'projects';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveProject(project: Project): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...project, savedAt: Date.now() }));
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<Project | undefined>);
}

export async function listProjects(): Promise<Project[]> {
  const all = await tx<Project[]>('readonly', (s) => s.getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await tx('readonly', (s) => s.delete(id));
}
