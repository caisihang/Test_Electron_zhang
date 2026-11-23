// 本地提醒：启动扫描 + 系统通知（Web 用 Notification API，Tauri 走 Rust notify_pending）
import { invokeCommand, isTauri } from './tauri'

/** 发送一条待办汇总通知 */
export async function notifyPending(count: number, detail: string): Promise<void> {
  if (isTauri()) {
    await invokeCommand<void>('notify_pending', { count, detail })
    return
  }
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  new Notification('今日财务待办', { body: `${count} 项需要处理：${detail}` })
}

/** 申请通知权限（需用户点击触发） */
export async function requestNotifyPermission(): Promise<string> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

/** 当前通知权限 */
export function notifyPermission(): string {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}
