// 轻量 IndexedDB 封装：负责数据库快照、附件 Blob、备份包、恢复暂存
// 说明：Web 预览模式用 IndexedDB 类比 Tauri 的 app_data_dir；接入 Tauri 后由 Rust 直接读写文件系统

const DB_NAME = 'personal-finance'
const DB_VERSION = 1

/** 对象仓库：kv(数据库快照/标记)、files(附件)、backups(备份包)、staging(恢复暂存) */
export type StoreName = 'kv' | 'files' | 'backups' | 'staging'

let dbPromise: Promise<IDBDatabase> | null = null

function openIdb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of ['kv', 'files', 'backups', 'staging'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// 通用读取
export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

// 通用写入
export async function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// 通用删除
export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// 读取整个仓库的键值对
export async function idbEntries<T>(store: StoreName): Promise<{ key: string; value: T }[]> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).openCursor()
    const rows: { key: string; value: T }[] = []
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        rows.push({ key: String(cursor.key), value: cursor.value as T })
        cursor.continue()
      } else {
        resolve(rows)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

// 清空指定仓库
export async function idbClear(store: StoreName): Promise<void> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
