// 文件夹服务：桌面端选择目录、扫描合同文件、生成预览地址
// 说明：仅 Tauri 桌面端可用，浏览器预览模式会抛出明确错误
import { convertFileSrc, invokeCommand, isTauri } from './tauri'

/** 扫描出的文件项（与 Rust FolderFile 对齐） */
export interface FolderFile {
  name: string
  path: string
  relative_path: string
  size: number
  modified: number
  ext: string
}

/** 预览类型 */
export type PreviewKind = 'image' | 'pdf' | 'text' | 'other'

/** 打开原生文件夹选择框，返回绝对路径；取消返回 null */
export async function pickContractFolder(): Promise<string | null> {
  if (!isTauri()) throw new Error('选择文件夹仅在桌面端可用')
  // 动态引入，避免浏览器模式加载桌面插件
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: '选择合同文件夹' })
  return typeof selected === 'string' ? selected : null
}

/** 扫描目录下全部合同类文件（Rust 递归扫描，并自动授权 asset 预览） */
export async function scanContractFolder(dir: string): Promise<FolderFile[]> {
  return invokeCommand<FolderFile[]>('scan_contract_folder', { dir })
}

/** 本地文件预览地址（asset 协议，已由扫描命令动态授权） */
export function localFileSrc(path: string): string {
  return convertFileSrc(path)
}

/** 读取文件字节（PDF / 文本预览兜底） */
export async function readFileBytes(path: string): Promise<ArrayBuffer> {
  const result = await invokeCommand<ArrayBuffer | number[]>('read_file_bytes', { path })
  // 正常情况返回 ArrayBuffer；兼容老版本返回数字数组
  if (result instanceof ArrayBuffer) return result
  return new Uint8Array(result).buffer
}

/** 用系统默认程序打开文件/文件夹 */
export async function openLocalPath(path: string): Promise<void> {
  await invokeCommand<void>('open_path', { path })
}

/** 根据扩展名判断预览方式 */
export function previewKind(ext: string): PreviewKind {
  const value = ext.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(value)) return 'image'
  if (value === 'pdf') return 'pdf'
  if (['txt', 'md', 'csv', 'log'].includes(value)) return 'text'
  return 'other'
}

/** 扩展名 -> MIME（写入文件索引时使用） */
export function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  return map[ext.toLowerCase()] ?? 'application/octet-stream'
}

/** 文件大小展示 */
export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

/** 把秒级时间戳格式化为 yyyy-MM-dd HH:mm */
export function formatStamp(seconds: number): string {
  if (!seconds) return '-'
  const date = new Date(seconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
