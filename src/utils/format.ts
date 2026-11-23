// 通用格式化工具
import dayjs from 'dayjs'

/** 金额格式化：千分位 + 两位小数 */
export function formatMoney(value: number | null | undefined, withSymbol = false): string {
  const num = Number(value ?? 0)
  const text = num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withSymbol ? `¥${text}` : text
}

/** 带正负号的金额（收入 +、支出 -） */
export function formatSignedMoney(value: number, direction: 'income' | 'expense'): string {
  const sign = direction === 'income' ? '+' : '-'
  return `${sign}${formatMoney(Math.abs(value))}`
}

/** 日期格式化 */
export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD') : value
}

/** 日期时间格式化 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value
}

/** 今天的 YYYY-MM-DD */
export function today(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 当前月份 YYYY-MM */
export function currentMonth(): string {
  return dayjs().format('YYYY-MM')
}

/** 本月第一天 / 最后一天 */
export function monthRange(month?: string): { start: string; end: string } {
  const base = month ? dayjs(`${month}-01`) : dayjs()
  return {
    start: base.startOf('month').format('YYYY-MM-DD'),
    end: base.endOf('month').format('YYYY-MM-DD'),
  }
}

/** 计算执行率（0~1，防止除零） */
export function ratio(part: number, total: number): number {
  if (!total) return 0
  return Math.max(0, Math.min(1.5, part / total))
}

/** 百分比展示 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** 生成本地 UUID（附件文件名用） */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

/** 解析日期是否已过期（不含今天） */
export function isPastDate(date?: string | null): boolean {
  if (!date) return false
  return dayjs(date).isBefore(dayjs().startOf('day'))
}

/** 距今天数（正数为未来） */
export function daysFromToday(date: string): number {
  return dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day')
}

/** 文件大小展示 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 合同方向文案 */
export const directionText: Record<'income' | 'expense', string> = {
  income: '收入',
  expense: '支出',
}

/** 合同状态文案 */
export const contractStatusText: Record<string, string> = {
  draft: '草稿',
  active: '执行中',
  completed: '已完成',
  terminated: '已终止',
}

/** 计划状态文案 */
export const scheduleStatusText: Record<string, string> = {
  pending: '待收付',
  partial: '部分',
  settled: '已结清',
  overdue: '已逾期',
}

/** 账户类型文案 */
export const accountTypeText: Record<string, string> = {
  bank: '银行卡',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
}

/** 发票方向文案 */
export const invoiceDirectionText: Record<string, string> = {
  issued: '开票',
  received: '收票',
}

/** 发票状态文案 */
export const invoiceStatusText: Record<string, string> = {
  normal: '正常',
  missing_payment: '缺流水',
  missing_invoice: '缺发票',
}

/** 计划标签预设 */
export const scheduleLabels = ['预付款', '进度款', '尾款', '质保金']
