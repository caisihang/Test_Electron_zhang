// 合同仓储：台账查询、增删改（软删除）、变更留痕
import { queryAll, queryOne, update } from '../database'
import type { Contract, ContractChange, ContractRow, ContractStatus, Direction } from '@/types/models'

export interface ContractInput {
  contract_no: string
  title: string
  direction: Direction
  counterparty: string
  sign_date: string | null
  start_date: string | null
  end_date: string | null
  total_amount: number
  status: ContractStatus
  note: string | null
}

export interface ContractFilter {
  keyword?: string
  direction?: Direction | ''
  status?: ContractStatus | ''
  includeDeleted?: boolean
}

// 需要留痕的字段与中文名
const TRACKED_FIELDS: Record<string, string> = {
  total_amount: '合同金额',
  start_date: '开始日期',
  end_date: '结束日期',
  status: '合同状态',
}

/** 合同台账列表（含已收/已付、未结清计划数） */
export function listContracts(filter: ContractFilter = {}): ContractRow[] {
  const where: string[] = []
  const params: (string | number)[] = []

  where.push(filter.includeDeleted ? '1 = 1' : 'c.deleted_at IS NULL')
  if (filter.keyword?.trim()) {
    where.push('(c.title LIKE ? OR c.contract_no LIKE ? OR c.counterparty LIKE ?)')
    const kw = `%${filter.keyword.trim()}%`
    params.push(kw, kw, kw)
  }
  if (filter.direction) {
    where.push('c.direction = ?')
    params.push(filter.direction)
  }
  if (filter.status) {
    where.push('c.status = ?')
    params.push(filter.status)
  }

  return queryAll<ContractRow>(
    `SELECT c.*,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.contract_id = c.id AND t.deleted_at IS NULL AND t.direction = 'income'), 0) AS income_total,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.contract_id = c.id AND t.deleted_at IS NULL AND t.direction = 'expense'), 0) AS expense_total,
       (SELECT COUNT(*) FROM schedules s
        WHERE s.contract_id = c.id AND s.status <> 'settled') AS open_schedule_count
     FROM contracts c
     WHERE ${where.join(' AND ')}
     ORDER BY c.created_at DESC, c.id DESC`,
    params,
  )
}

/** 单个合同 */
export function getContract(id: number): Contract | null {
  return queryOne<Contract>('SELECT * FROM contracts WHERE id = ?', [id])
}

/** 生成建议合同编号 */
export function nextContractNo(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const row = queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM contracts WHERE contract_no LIKE ?', [
    `HT-${datePart}-%`,
  ])
  const seq = String((row?.c ?? 0) + 1).padStart(3, '0')
  return `HT-${datePart}-${seq}`
}

/** 新建合同 */
export function createContract(input: ContractInput): number {
  return update(
    `INSERT INTO contracts
      (contract_no, title, direction, counterparty, sign_date, start_date, end_date, total_amount, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.contract_no.trim(),
      input.title.trim(),
      input.direction,
      input.counterparty.trim(),
      input.sign_date || null,
      input.start_date || null,
      input.end_date || null,
      input.total_amount || 0,
      input.status,
      input.note || null,
    ],
  )
}

/** 更新合同，并对金额/日期/状态变更写入 contract_changes */
export function updateContract(id: number, input: ContractInput, reason = ''): void {
  const old = getContract(id)
  if (!old) throw new Error('合同不存在')

  update(
    `UPDATE contracts SET contract_no = ?, title = ?, direction = ?, counterparty = ?, sign_date = ?,
       start_date = ?, end_date = ?, total_amount = ?, status = ?, note = ?,
       updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      input.contract_no.trim(),
      input.title.trim(),
      input.direction,
      input.counterparty.trim(),
      input.sign_date || null,
      input.start_date || null,
      input.end_date || null,
      input.total_amount || 0,
      input.status,
      input.note || null,
      id,
    ],
  )

  // 关键字段留痕（只记录，不自动改写已生成的计划）
  for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
    const oldValue = (old as unknown as Record<string, unknown>)[field]
    const newValue = (input as unknown as Record<string, unknown>)[field]
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      update(
        `INSERT INTO contract_changes (contract_id, field_name, old_value, new_value, reason)
         VALUES (?, ?, ?, ?, ?)`,
        [id, label, oldValue === null ? null : String(oldValue), newValue === null ? null : String(newValue), reason || null],
      )
    }
  }
}

/** 软删除合同（回收站可恢复） */
export function softDeleteContract(id: number): void {
  update(`UPDATE contracts SET deleted_at = datetime('now','localtime') WHERE id = ?`, [id])
}

/** 从回收站恢复 */
export function restoreContract(id: number): void {
  update('UPDATE contracts SET deleted_at = NULL WHERE id = ?', [id])
}

/** 彻底删除合同（含计划、变更、发票、解绑流水） */
export function purgeContract(id: number): void {
  update('DELETE FROM contract_changes WHERE contract_id = ?', [id])
  update('DELETE FROM invoices WHERE contract_id = ?', [id])
  update('UPDATE transactions SET contract_id = NULL, schedule_id = NULL WHERE contract_id = ?', [id])
  update('DELETE FROM schedules WHERE contract_id = ?', [id])
  update('DELETE FROM contracts WHERE id = ?', [id])
}

/** 合同变更历史 */
export function listContractChanges(contractId: number): ContractChange[] {
  return queryAll<ContractChange>(
    'SELECT * FROM contract_changes WHERE contract_id = ? ORDER BY changed_at DESC, id DESC',
    [contractId],
  )
}

/** 合同执行汇总（详情页顶部卡片） */
export interface ContractProgress {
  planned_total: number
  income_total: number
  expense_total: number
  settled_count: number
  total_count: number
}

export function getContractProgress(contractId: number): ContractProgress {
  const planned =
    queryOne<{ v: number }>('SELECT COALESCE(SUM(planned_amount), 0) AS v FROM schedules WHERE contract_id = ?', [
      contractId,
    ])?.v ?? 0
  const income =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM transactions
       WHERE contract_id = ? AND deleted_at IS NULL AND direction = 'income'`,
      [contractId],
    )?.v ?? 0
  const expense =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM transactions
       WHERE contract_id = ? AND deleted_at IS NULL AND direction = 'expense'`,
      [contractId],
    )?.v ?? 0
  const counts = queryOne<{ settled: number; total: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) AS settled,
       COUNT(*) AS total
     FROM schedules WHERE contract_id = ?`,
    [contractId],
  )
  return {
    planned_total: planned,
    income_total: income,
    expense_total: expense,
    settled_count: counts?.settled ?? 0,
    total_count: counts?.total ?? 0,
  }
}
