// 本地提醒：启动扫描 + 系统通知
// Tauri 桌面端走 notification 插件（WebView2 不支持浏览器 Notification 权限）；
// 浏览器预览模式仍用标准 Notification API
import { isTauri } from './tauri'

/** 发送一条待办汇总通知 */
export async function notifyPending(count: number, detail: string): Promise<void> {
  if (isTauri()) {
    const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification')
    if (!(await isPermissionGranted())) {
      console.log('[notifier] 系统通知权限未授予，跳过')
      return
    }
    sendNotification({ title: '今日财务待办', body: `${count} 项需要处理：${detail}` })
    return
  }
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  new Notification('今日财务待办', { body: `${count} 项需要处理：${detail}` })
}

/** 申请通知权限（需用户点击触发） */
export async function requestNotifyPermission(): Promise<string> {
  if (isTauri()) {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
    if (await isPermissionGranted()) return 'granted'
    // 返回 'granted' | 'denied' | 'default'（Windows 无弹窗，通常直接 granted）
    return requestPermission()
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

/** 当前通知权限（Tauri 下需要异步查询插件） */
export async function notifyPermission(): Promise<string> {
  if (isTauri()) {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification')
    return (await isPermissionGranted()) ? 'granted' : 'default'
  }
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}
