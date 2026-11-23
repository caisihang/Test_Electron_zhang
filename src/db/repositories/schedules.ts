// 收付款计划仓储 + 核销逻辑（推荐匹配 + 人工确认）
import { queryAll, queryOne, update } from '../database'
import type { Direction, ReconcileCandidate, Schedule, ScheduleRow, ScheduleStatus, Transaction } from '@/types/models'
import { today } from '@/utils/format'

export interface ScheduleFilter {
  contractId?: number
  direction?: Direction | ''
  // all / open(未结清) / settled / overdue
  status?: 'all' | 'open' | 'settled' | 'overdue'
  keyword?: string
  from?: string
  to?: string
}

export interface ScheduleInput {
  contract_id: number
  label: string | null
  due_date: string
  planned_amount: number
  sort_order?: number
}

/** 计划列表（联合同信息） */
export function listSchedules(filter: ScheduleFilter = {}): ScheduleRow[] {
  const where: string[] = ['c.deleted_at IS NULL']
  const params: (string | number)[] = []

  if (filter.contractId) {
    where.push('s.contract_id = ?')
    params.push(filter.contractId)
  }
  if (filter.direction) {
    where.push('s.direction = ?')
    params.push(filter.direction)
  }
  if (filter.status === 'open') where.push(`s.status IN ('pending','partial','overdue')`)
  if (filter.status === 'settled') where.push(`s.status = 'settled'`)
  if (filter.status === 'overdue') where.push(`s.status <> 'settled' AND s.due_date < date('now','localtime')`)
  if (filter.keyword?.trim()) {
    where.push('(c.title LIKE ? OR c.contract_no LIKE ? OR c.counterparty LIKE ? OR s.label LIKE ?)')
    const kw = `%${filter.keyword.trim()}%`
    params.push(kw, kw, kw, kw)
  }
  if (filter.from) {
    where.push('s.due_date >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    where.push('s.due_date <= ?')
    params.push(filter.to)
  }

  return queryAll<ScheduleRow>(
    `SELECT s.*, c.title AS contract_title, c.contract_no, c.counterparty
     FROM schedules s
     JOIN contracts c ON c.id = s.contract_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.due_date ASC, s.sort_order ASC, s.id ASC`,
    params,
  )
}

/** 单条计划 */
export function getSchedule(id: number): Schedule | null {
  return queryOne<Schedule>('SELECT * FROM schedules WHERE id = ?', [id])
}

/** 新增计划 */
export function createSchedule(input: ScheduleInput): number {
  const contract = queryOne<{ direction: Direction }>('SELECT direction FROM contracts WHERE id = ?', [
    input.contract_id,
  ])
  if (!contract) throw new Error('合同不存在')

  const sortOrder =
    input.sort_order ??
    (queryOne<{ v: number }>('SELECT COALESCE(MAX(sort_order), 0) AS v FROM schedules WHERE contract_id = ?', [
      input.contract_id,
    ])?.v ?? 0) + 1

  return update(
    `INSERT INTO schedules (contract_id, direction, label, due_date, planned_amount, actual_amount, status, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
    [input.contract_id, contract.direction, input.label || null, input.due_date, input.planned_amount, sortOrder],
  )
}

/** 批量生成计划（合同详情“生成计划”） */
export function generateSchedules(contractId: number, items: ScheduleInput[]): number[] {
  return items.map((item) => createSchedule({ ...item, contract_id: contractId }))
}

/** 更新计划（金额变化后重算状态） */
export function updateSchedule(
  id: number,
  input: Pick<ScheduleInput, 'label' | 'due_date' | 'planned_amount' | 'sort_order'>,
): void {
  update('UPDATE schedules SET label = ?, due_date = ?, planned_amount = ?, sort_order = ? WHERE id = ?', [
    input.label || null,
    input.due_date,
    input.planned_amount,
    input.sort_order ?? 0,
    id,
  ])
  recalcSchedule(id)
}

/** 删除计划：已有核销流水时禁止删除 */
export function deleteSchedule(id: number): void {
  const linked =
    queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM transactions WHERE schedule_id = ? AND deleted_at IS NULL', [id])
      ?.c ?? 0
  if (linked > 0) throw new Error('该计划已有流水关联，请先取消核销后再删除')
  update('DELETE FROM schedules WHERE id = ?', [id])
}

/**
 * 重算计划：actual_amount 为关联流水金额合计，status 按是否结清 / 是否逾期推导
 * 对应 README 3.2 的核销逻辑
 */
export function recalcSchedule(id: number): void {
  const schedule = getSchedule(id)
  if (!schedule) return

  const total =
    queryOne<{ v: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS v FROM transactions WHERE schedule_id = ? AND deleted_at IS NULL',
      [id],
    )?.v ?? 0

  let status: ScheduleStatus = 'pending'
  if (total >= schedule.planned_amount - 0.01) {
    status = 'settled'
  } else if (total > 0) {
    status = schedule.due_date < today() ? 'overdue' : 'partial'
  } else if (schedule.due_date < today()) {
    status = 'overdue'
  }

  update('UPDATE schedules SET actual_amount = ?, status = ? WHERE id = ?', [total, status, id])
}

/** 重算某合同下全部计划 */
export function recalcContractSchedules(contractId: number): void {
  const ids = queryAll<{ id: number }>('SELECT id FROM schedules WHERE contract_id = ?', [contractId])
  ids.forEach((row) => recalcSchedule(row.id))
}

/** 查找核销候选：同合同、同方向、未结清，金额越接近分数越高 */
export function findReconcileCandidates(transactionId: number): ReconcileCandidate[] {
  const txn = queryOne<Transaction>('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [transactionId])
  if (!txn || txn.contract_id === null) return []

  const rows = queryAll<ScheduleRow & { contract_title: string }>(
    `SELECT s.*, c.title AS contract_title, c.contract_no
     FROM schedules s JOIN contracts c ON c.id = s.contract_id
     WHERE s.contract_id = ? AND s.direction = ? AND s.status IN ('pending','partial','overdue')
     ORDER BY s.due_date ASC`,
    [txn.contract_id, txn.direction],
  )

  const candidates = rows.map((row) => {
    const remaining = Math.max(row.planned_amount - row.actual_amount, 0)
    const amountScore = 1 - Math.abs(remaining - txn.amount) / Math.max(remaining, 1)
    return {
      schedule_id: row.id,
      contract_title: row.contract_title,
      contract_no: row.contract_no,
      label: row.label,
      due_date: row.due_date,
      planned_amount: row.planned_amount,
      actual_amount: row.actual_amount,
      remaining,
      score: amountScore,
    }
  })

  return candidates.sort((a, b) => b.score - a.score)
}

/** 确认核销 */
export function confirmReconcile(transactionId: number, scheduleId: number): void {
  const txn = queryOne<Transaction>('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [transactionId])
  if (!txn) throw new Error('流水不存在')
  const schedule = getSchedule(scheduleId)
  if (!schedule) throw new Error('计划不存在')
  if (schedule.contract_id !== txn.contract_id) throw new Error('流水与计划不属于同一合同')
  if (schedule.direction !== txn.direction) throw new Error('流水与计划方向不一致')

  const oldScheduleId = txn.schedule_id
  update('UPDATE transactions SET schedule_id = ? WHERE id = ?', [scheduleId, transactionId])
  if (oldScheduleId && oldScheduleId !== scheduleId) recalcSchedule(oldScheduleId)
  recalcSchedule(scheduleId)
}

/** 取消核销 */
export function cancelReconcile(transactionId: number): void {
  const txn = queryOne<Transaction>('SELECT * FROM transactions WHERE id = ?', [transactionId])
  if (!txn) return
  const oldScheduleId = txn.schedule_id
  update('UPDATE transactions SET schedule_id = NULL WHERE id = ?', [transactionId])
  if (oldScheduleId) recalcSchedule(oldScheduleId)
}

/** 逾期计划数量（菜单徽标 / 首页待办） */
export function countOverdueSchedules(): number {
  return (
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM schedules s JOIN contracts c ON c.id = s.contract_id
       WHERE c.deleted_at IS NULL AND s.status <> 'settled' AND s.due_date < date('now','localtime')`,
    )?.c ?? 0
  )
}

/** 临期（含逾期）计划清单，用于工作台待办 */
export function listPendingSchedules(reminderDays: number, limit = 8): ScheduleRow[] {
  return queryAll<ScheduleRow>(
    `SELECT s.*, c.title AS contract_title, c.contract_no, c.counterparty
     FROM schedules s JOIN contracts c ON c.id = s.contract_id
     WHERE c.deleted_at IS NULL AND s.status <> 'settled'
       AND s.due_date <= date('now','localtime', '+' || ? || ' day')
     ORDER BY s.due_date ASC
     LIMIT ?`,
    [reminderDays, limit],
  )
}
