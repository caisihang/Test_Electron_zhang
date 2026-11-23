// 备份与恢复
// Web 预览：备份包 = zip(manifest.json + finance.db + attachments/)，存放在 IndexedDB
// 恢复策略与 README 一致：先暂存，应用重启（页面刷新）时交换数据库与附件
import JSZip from 'jszip'
import dayjs from 'dayjs'
import { exportDatabaseBytes, persistNow, replaceDatabaseSnapshot } from '@/db/database'
import { SCHEMA_VERSION } from '@/db/schema'
import { idbClear, idbDelete, idbEntries, idbGet, idbPut } from '@/db/idb'
import type { AttachmentMeta, BackupMeta } from '@/types/models'

const BACKUP_STORE = 'backups'
const STAGING_KEY = 'pending-restore'
const LAST_BACKUP_KEY = 'last-backup-at'

interface BackupRecord {
  meta: BackupMeta
  blob: Blob
}

interface StagedFile extends AttachmentMeta {
  blob: Blob
}

interface StagedRestore {
  created_at: string
  manifest: Record<string, unknown>
  dbBytes: Uint8Array
  files: StagedFile[]
}

/** 生成备份包（auto 为 true 时计入自动备份上限） */
export async function createBackup(auto = false): Promise<BackupMeta> {
  await persistNow()

  const zip = new JSZip()
  const dbBytes = exportDatabaseBytes()
  const files = await idbEntries<StagedFile>('files')

  const manifest = {
    version: 1,
    schema_version: SCHEMA_VERSION,
    app: '个人财务',
    created_at: new Date().toISOString(),
    db_bytes: dbBytes.byteLength,
    attachment_count: files.length,
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('finance.db', dbBytes)
  for (const { key, value } of files) {
    zip.file(`attachments/${key}`, value.blob)
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const now = dayjs()
  const id = `backup-${now.valueOf()}`
  const meta: BackupMeta = {
    id,
    created_at: now.format('YYYY-MM-DD HH:mm:ss'),
    size: blob.size,
    auto,
    file_name: `finance-backup-${now.format('YYYY-MM-DD-HHmm')}.zip`,
  }

  await idbPut(BACKUP_STORE, id, { meta, blob } satisfies BackupRecord)
  await idbPut('kv', LAST_BACKUP_KEY, now.valueOf())

  if (auto) await trimAutoBackups(5)
  return meta
}

/** 自动备份只保留最近 5 份 */
async function trimAutoBackups(keep: number): Promise<void> {
  const records = await idbEntries<BackupRecord>(BACKUP_STORE)
  const autos = records
    .filter((row) => row.value.meta.auto)
    .sort((a, b) => b.value.meta.created_at.localeCompare(a.value.meta.created_at))
  for (const row of autos.slice(keep)) {
    await idbDelete(BACKUP_STORE, row.key)
  }
}

/** 备份列表（新到旧） */
export async function listBackups(): Promise<BackupMeta[]> {
  const records = await idbEntries<BackupRecord>(BACKUP_STORE)
  return records.map((row) => row.value.meta).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** 删除备份 */
export async function deleteBackup(id: string): Promise<void> {
  await idbDelete(BACKUP_STORE, id)
}

/** 下载备份包到本地 */
export async function downloadBackup(id: string): Promise<void> {
  const record = await idbGet<BackupRecord>(BACKUP_STORE, id)
  if (!record) throw new Error('备份不存在')
  const url = URL.createObjectURL(record.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = record.meta.file_name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** 从本地 zip 导入备份并暂存（重启后生效） */
export async function stageRestoreFromFile(file: File): Promise<{ manifest: Record<string, unknown>; fileCount: number }> {
  return stageZipBlob(file)
}

/** 从备份列表直接暂存恢复（重启后生效） */
export async function stageRestoreFromBackup(id: string): Promise<{ manifest: Record<string, unknown>; fileCount: number }> {
  const record = await idbGet<BackupRecord>(BACKUP_STORE, id)
  if (!record) throw new Error('备份不存在')
  return stageZipBlob(record.blob)
}

/** 解析 zip 并写入恢复暂存区 */
async function stageZipBlob(blob: Blob): Promise<{ manifest: Record<string, unknown>; fileCount: number }> {
  const zip = await JSZip.loadAsync(blob)
  const manifestEntry = zip.file('manifest.json')
  const dbEntry = zip.file('finance.db')
  if (!manifestEntry || !dbEntry) throw new Error('备份包缺少 manifest.json 或 finance.db，无法恢复')

  const manifest = JSON.parse(await manifestEntry.async('string')) as Record<string, unknown>
  const dbBytes = await dbEntry.async('uint8array')

  const files: StagedFile[] = []
  const entries = Object.keys(zip.files)
  for (const name of entries) {
    const entry = zip.files[name]
    if (entry.dir || !name.startsWith('attachments/')) continue
    const path = name.slice('attachments/'.length)
    if (!path) continue
    const blob = await entry.async('blob')
    files.push({
      path,
      name: path.split('/').pop() ?? path,
      size: blob.size,
      mime: blob.type || guessMime(path),
      created_at: new Date().toISOString(),
      blob,
    })
  }

  const staged: StagedRestore = {
    created_at: new Date().toISOString(),
    manifest,
    dbBytes,
    files,
  }
  await idbPut('staging', STAGING_KEY, staged)
  return { manifest, fileCount: files.length }
}

/** 是否存在待应用的恢复暂存 */
export async function hasPendingRestore(): Promise<boolean> {
  return (await idbGet<StagedRestore>('staging', STAGING_KEY)) !== undefined
}

/** 应用暂存的恢复数据（应用启动时调用），返回是否执行了恢复 */
export async function applyPendingRestore(): Promise<boolean> {
  const staged = await idbGet<StagedRestore>('staging', STAGING_KEY)
  if (!staged) return false

  await replaceDatabaseSnapshot(staged.dbBytes)
  await idbClear('files')
  for (const file of staged.files) {
    await idbPut('files', file.path, file)
  }
  await idbDelete('staging', STAGING_KEY)
  return true
}

/** 立即重启页面以应用暂存恢复 */
export function reloadToApply(): void {
  window.location.reload()
}

/** 距上次备份的小时数（无备份返回 Infinity） */
export async function hoursSinceLastBackup(): Promise<number> {
  const value = await idbGet<number>('kv', LAST_BACKUP_KEY)
  if (!value) return Number.POSITIVE_INFINITY
  return (Date.now() - value) / 3600000
}

/** 按间隔执行自动备份（启动时调用） */
export async function maybeAutoBackup(enabled: boolean, intervalHours: number): Promise<BackupMeta | null> {
  if (!enabled || intervalHours <= 0) return null
  const hours = await hoursSinceLastBackup()
  if (hours < intervalHours) return null
  // 首次启动（从无备份）只记录时间点，避免立刻生成空库备份
  if (!Number.isFinite(hours)) {
    await idbPut('kv', LAST_BACKUP_KEY, Date.now())
    return null
  }
  return createBackup(true)
}

/** 根据扩展名猜测 MIME（zip 解出的 Blob 可能没有类型） */
function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return map[ext] ?? 'application/octet-stream'
}
