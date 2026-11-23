// 全局应用状态：设置项、菜单徽标、启动状态
import { defineStore } from 'pinia'
import { getSetting, setSetting } from '@/db/database'
import { countOverdueSchedules } from '@/db/repositories/schedules'
import { queryOne } from '@/db/database'
import { listPendingSchedules } from '@/db/repositories/schedules'
import { notifyPending } from '@/services/notifier'

export const useAppStore = defineStore('app', {
  state: () => ({
    ready: false,
    // 临期提醒天数
    reminderDays: 3,
    // 启动时是否发送系统通知
    notifyEnabled: true,
    // 自动备份
    autoBackupEnabled: true,
    autoBackupHours: 24,
    // 菜单徽标
    todoCount: 0,
    overdueSchedules: 0,
    overdueContracts: 0,
    // 本次启动是否应用了备份恢复
    restoredOnBoot: false,
    // 全局提示
    toast: { text: '', type: 'success' as 'success' | 'error' | 'info', visible: false, nonce: 0 },
  }),
  actions: {
    /** 从 settings 表载入配置 */
    loadSettings(): void {
      this.reminderDays = Number(getSetting('reminder_days', '3')) || 3
      this.notifyEnabled = getSetting('notify_enabled', '1') === '1'
      this.autoBackupEnabled = getSetting('auto_backup_enabled', '1') === '1'
      this.autoBackupHours = Number(getSetting('auto_backup_hours', '24')) || 24
      this.ready = true
    },
    /** 保存提醒天数 */
    saveReminderDays(days: number): void {
      this.reminderDays = Math.max(0, Math.min(30, Math.floor(days)))
      setSetting('reminder_days', String(this.reminderDays))
    },
    /** 保存通知开关 */
    saveNotifyEnabled(enabled: boolean): void {
      this.notifyEnabled = enabled
      setSetting('notify_enabled', enabled ? '1' : '0')
    },
    /** 保存自动备份配置 */
    saveAutoBackup(enabled: boolean, hours: number): void {
      this.autoBackupEnabled = enabled
      this.autoBackupHours = Math.max(1, Math.floor(hours))
      setSetting('auto_backup_enabled', enabled ? '1' : '0')
      setSetting('auto_backup_hours', String(this.autoBackupHours))
    },
    /** 刷新菜单徽标 */
    refreshBadges(): void {
      this.overdueSchedules = countOverdueSchedules()
      this.overdueContracts =
        queryOne<{ c: number }>(
          `SELECT COUNT(*) AS c FROM contracts
           WHERE deleted_at IS NULL AND status = 'active'
             AND end_date IS NOT NULL AND end_date < date('now','localtime')`,
        )?.c ?? 0
      // 工作台徽标：逾期 + 临期（需要行动的数字）
      this.todoCount = listPendingSchedules(this.reminderDays, 999).length
    },
    /** 启动时扫描待办并发送通知 */
    async scanTodosAndNotify(): Promise<void> {
      if (!this.notifyEnabled) return
      const pending = listPendingSchedules(this.reminderDays, 50)
      if (pending.length === 0) return
      const detail = pending
        .slice(0, 3)
        .map((item) => `${item.contract_title} ${item.due_date}`)
        .join('、')
      try {
        await notifyPending(pending.length, detail)
      } catch (error) {
        console.log('[notify] 发送通知失败', error)
      }
    },
    /** 显示轻提示 */
    showToast(text: string, type: 'success' | 'error' | 'info' = 'success'): void {
      // nonce 每次自增，用作 key 让相同文案也能重新播放入场动画
      this.toast = { text, type, visible: true, nonce: this.toast.nonce + 1 }
      window.setTimeout(() => {
        this.toast.visible = false
      }, 2800)
    },
  },
})
