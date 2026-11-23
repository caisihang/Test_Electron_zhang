// 附件服务
// Web 预览：文件以 Blob 存入 IndexedDB，数据库只保存相对路径（与 README 约定一致）
// Tauri：改为调用 Rust 的 import_attachment / resolve_attachment_path
import { idbDelete, idbEntries, idbGet, idbPut } from '@/db/idb'
import type { AttachmentMeta } from '@/types/models'
import { uuid } from '@/utils/format'
import { convertFileSrc, invokeCommand, isTauri } from './tauri'

const FILE_STORE = 'files'

// Blob URL 缓存，避免重复创建导致内存泄漏
const urlCache = new Map<string, string>()

interface AttachmentRecord extends AttachmentMeta {
  blob: Blob
}

/** 导入附件，返回相对路径（如 contract/12/xxx.pdf） */
export async function importAttachment(file: File, bizType: string, bizId: number): Promise<string> {
  if (isTauri()) {
    // Tauri 模式：由 Rust 完成文件复制（file 对象在 Tauri 下需配合 dialog 插件获取路径，此处保留接口）
    return invokeCommand<string>('import_attachment', {
      sourcePath: (file as unknown as { path?: string }).path ?? '',
      bizType,
      bizId,
    })
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${bizType}/${bizId}/${uuid()}.${ext}`
  const record: AttachmentRecord = {
    path,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    created_at: new Date().toISOString(),
    blob: file,
  }
  await idbPut(FILE_STORE, path, record)
  return path
}

/** 读取附件记录（含 Blob） */
export async function getAttachment(path: string): Promise<AttachmentRecord | null> {
  return (await idbGet<AttachmentRecord>(FILE_STORE, path)) ?? null
}

/** 取得可预览的 URL（Web 为 blob:，Tauri 为 asset:） */
export async function getAttachmentUrl(path: string): Promise<string> {
  if (isTauri()) {
    const absPath = await invokeCommand<string>('resolve_attachment_path', { relativePath: path })
    return convertFileSrc(absPath)
  }
  const cached = urlCache.get(path)
  if (cached) return cached
  const record = await getAttachment(path)
  if (!record) return ''
  const url = URL.createObjectURL(record.blob)
  urlCache.set(path, url)
  return url
}

/** 按业务前缀列出附件（如 contract/12/） */
export async function listAttachmentsByPrefix(prefix: string): Promise<AttachmentMeta[]> {
  const rows = await idbEntries<AttachmentRecord>(FILE_STORE)
  return rows
    .filter((row) => row.key.startsWith(prefix))
    .map((row) => {
      const { blob: _blob, ...meta } = row.value
      return meta
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** 附件展示名 */
export function attachmentName(path: string): string {
  return path.split('/').pop() ?? path
}

/** 删除附件 */
export async function deleteAttachment(path: string): Promise<void> {
  if (isTauri()) {
    await invokeCommand<void>('delete_attachment', { relativePath: path })
    return
  }
  const cached = urlCache.get(path)
  if (cached) {
    URL.revokeObjectURL(cached)
    urlCache.delete(path)
  }
  await idbDelete(FILE_STORE, path)
}

/** 是否可直接在页面内预览（图片 / PDF） */
export function isPreviewable(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf'
}

/** 通过系统默认程序打开（Tauri）；Web 下退化为下载 */
export async function openAttachment(path: string): Promise<void> {
  if (isTauri()) {
    const absPath = await invokeCommand<string>('resolve_attachment_path', { relativePath: path })
    await invokeCommand<void>('open_path', { path: absPath })
    return
  }
  const record = await getAttachment(path)
  if (!record) return
  const url = URL.createObjectURL(record.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = record.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
