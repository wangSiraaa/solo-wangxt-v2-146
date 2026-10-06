/**
 * IndexedDB 工程存储（无后端，全部保存在浏览器本地）。
 */
export interface Project {
  id?: number
  name: string
  updatedAt: number
  /** 用户输入框草稿（可能尚未通过解析） */
  draftSmiles: string
  /** 当前分子图的 V2000 molblock（含坐标与立体信息） */
  molblock: string
  canonicalSmiles: string
}

const DB_NAME = 'mol-editor'
const STORE = 'projects'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export function listProjects(): Promise<Project[]> {
  return tx('readonly', (s) => s.getAll() as IDBRequest<Project[]>)
}

export function saveProject(p: Project): Promise<number> {
  return tx('readwrite', (s) => s.put(p) as IDBRequest<number>)
}

export function deleteProject(id: number): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}
