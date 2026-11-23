// 数据库核心：sql.js(WASM) 初始化、迁移、查询封装、快照持久化（IndexedDB）
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { idbGet, idbPut } from './idb'
import { MIGRATIONS } from './schema'

const SNAPSHOT_KEY = 'finance.db'

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let persistTimer: number | null = null
let persistedAt = 0

/** 取得数据库实例（必须在 initDatabase 之后调用） */
export function getDb(): Database {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

/** 初始化数据库：载入快照 -> 执行迁移 -> 初始化默认数据 -> 落地一次快照 */
export async function initDatabase(): Promise<void> {
  if (db) return
  // @types/sql.js 的 SqlJsConfig 必填字段与实际运行时不符，这里做类型兼容
  SQL = await initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<typeof initSqlJs>[0])
  const saved = await idbGet<Uint8Array>('kv', SNAPSHOT_KEY)
  db = saved && saved.byteLength > 0 ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  runMigrations()
  seedDefaults()
  markOverdueSchedules()
  await persistNow()
}

/** 是否已初始化 */
export function isDatabaseReady(): boolean {
  return db !== null
}

/** 关闭并清空内存实例（恢复数据后重新初始化用） */
export function closeDatabase(): void {
  db?.close()
  db = null
}

/** 按 PRAGMA user_version 执行未应用的迁移 */
function runMigrations(): void {
  const database = getDb()
  const result = database.exec('PRAGMA user_version')
  const current = Number(result[0]?.values?.[0]?.[0] ?? 0)
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    database.exec(migration.sql)
    database.exec(`PRAGMA user_version = ${migration.version}`)
  }
}

/** 首次初始化：写入默认账户与常用分类 */
function seedDefaults(): void {
  const seeded = getSetting('seeded', '')
  if (seeded === '1') return

  const accountCount = queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM accounts')?.c ?? 0
  if (accountCount === 0) {
    const defaults: [string, string][] = [
      ['现金', 'cash'],
      ['微信', 'wechat'],
      ['支付宝', 'alipay'],
      ['招商银行卡', 'bank'],
    ]
    for (const [name, type] of defaults) {
      update('INSERT INTO accounts (name, account_type, initial_balance) VALUES (?, ?, 0)', [name, type])
    }
  }

  const categoryCount = queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c ?? 0
  if (categoryCount === 0) {
    const seeds: { name: string; direction: string; children: string[] }[] = [
      { name: '餐饮', direction: 'expense', children: ['早餐', '午餐', '晚餐', '外卖'] },
      { name: '交通', direction: 'expense', children: ['打车', '加油', '公交地铁'] },
      { name: '居住', direction: 'expense', children: ['房租', '物业', '水电燃气'] },
      { name: '购物', direction: 'expense', children: ['日用品', '数码', '服饰'] },
      { name: '娱乐', direction: 'expense', children: ['影音', '出行游玩'] },
      { name: '医疗', direction: 'expense', children: [] },
      { name: '人情往来', direction: 'expense', children: [] },
      { name: '其他支出', direction: 'expense', children: [] },
      { name: '工资', direction: 'income', children: [] },
      { name: '项目回款', direction: 'income', children: [] },
      { name: '投资收益', direction: 'income', children: [] },
      { name: '其他收入', direction: 'income', children: [] },
    ]
    seeds.forEach((seed, index) => {
      const parentId = update(
        'INSERT INTO categories (parent_id, name, direction, sort_order) VALUES (NULL, ?, ?, ?)',
        [seed.name, seed.direction, index],
      )
      seed.children.forEach((child, childIndex) => {
        update('INSERT INTO categories (parent_id, name, direction, sort_order) VALUES (?, ?, ?, ?)', [
          parentId,
          child,
          seed.direction,
          childIndex,
        ])
      })
    })
  }

  setSetting('seeded', '1')
}

/** 启动时把已过期且未结清的计划标记为 overdue */
export function markOverdueSchedules(): void {
  update(
    `UPDATE schedules SET status = 'overdue'
     WHERE status IN ('pending','partial') AND due_date < date('now','localtime')`,
  )
}

/** 查询多行 */
export function queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

/** 查询单行 */
export function queryOne<T>(sql: string, params: SqlValue[] = []): T | null {
  const rows = queryAll<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/** 执行写入语句，返回最后插入的自增 ID，并触发快照保存 */
export function update(sql: string, params: SqlValue[] = []): number {
  getDb().run(sql, params)
  markDirty()
  return queryOne<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0
}

/** 简易事务包装（sql.js 不支持并发，直接 BEGIN/COMMIT） */
export function withTransaction<T>(fn: () => T): T {
  const database = getDb()
  database.run('BEGIN')
  try {
    const result = fn()
    database.run('COMMIT')
    markDirty()
    return result
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }
}

/** 读取设置项 */
export function getSetting(key: string, fallback = ''): string {
  const row = queryOne<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? fallback
}

/** 写入设置项 */
export function setSetting(key: string, value: string): void {
  update(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  )
}

/** 延迟保存快照，避免连续写入时频繁序列化 */
export function markDirty(): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    void persistNow()
  }, 200)
}

/** 立即保存数据库快照到 IndexedDB */
export async function persistNow(): Promise<void> {
  if (!db) return
  const bytes = db.export()
  await idbPut('kv', SNAPSHOT_KEY, bytes)
  persistedAt = Date.now()
}

/** 最近一次快照落盘时间 */
export function lastPersistedAt(): number {
  return persistedAt
}

/** 导出当前数据库字节（备份用） */
export function exportDatabaseBytes(): Uint8Array {
  return getDb().export()
}

/** 用备份中的数据库字节替换当前快照（恢复用，需要刷新页面） */
export async function replaceDatabaseSnapshot(bytes: Uint8Array): Promise<void> {
  await idbPut('kv', SNAPSHOT_KEY, bytes)
}

/** 页面关闭前尽量保存一次 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (db) {
      try {
        const bytes = db.export()
        void idbPut('kv', SNAPSHOT_KEY, bytes)
      } catch {
        // 忽略关闭阶段的持久化异常
      }
    }
  })
}
