// 桌面端导出：弹原生「另存为」对话框，再由 Rust 命令写文件
// 背景：WebView2 没有下载管理器，<a download> 在 exe 里点了无反应
import { invokeCommand, isTauri } from './tauri'

export interface SaveFilter {
  name: string
  extensions: string[]
}

/** 字节转 base64（分块处理，避免超长参数导致调用栈溢出） */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 浏览器预览：用 Blob 触发下载 */
function browserDownload(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes]))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * 保存字节到用户选择的路径
 * @returns 桌面端返回最终路径；用户取消返回 null；浏览器返回文件名
 */
export async function saveBytes(
  defaultName: string,
  bytes: Uint8Array,
  filters: SaveFilter[],
): Promise<string | null> {
  if (!isTauri()) {
    browserDownload(defaultName, bytes)
    return defaultName
  }
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: defaultName, filters })
  if (!path) return null
  await invokeCommand<void>('write_file_bytes', { path, base64Data: toBase64(bytes) })
  return path
}

/** Blob 版本（备份 zip 用） */
export async function saveBlob(
  defaultName: string,
  blob: Blob,
  filters: SaveFilter[],
): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return saveBytes(defaultName, bytes, filters)
}
