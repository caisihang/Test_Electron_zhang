// 收支流水仓储
import { queryAll, queryOne, update } from '../database'
import type { Direction, Transaction, TransactionRow } from '@/types/models'
import { recalcSchedule } from './schedules'

export interface TransactionFilter {
  keyword?: string
  direction?: Direction | ''
  accountId?: number
  contractId?: number
  from?: string
  to?: string
  limit?: number
}

export interface TransactionInput {
  account_id: number
  direction: Direction
  amount: number
  txn_date: string
  category_l1: string | null
  category_l2: string | null
  contract_id: number | null
  schedule_id: number | null
  counterparty: string | null
  note: string | null
  voucher_path: string | null
}

/** 流水列表（含账户、合同、计划名称） */
export function listTransactions(filter: TransactionFilter = {}): TransactionRow[] {
  const where: string[] = ['t.deleted_at IS NULL']
  const params: (string | number)[] = []

  if (filter.keyword?.trim()) {
    where.push('(t.counterparty LIKE ? OR t.note LIKE ? OR c.title LIKE ? OR c.contract_no LIKE ?)')
    const kw = `%${filter.keyword.trim()}%`
    params.push(kw, kw, kw, kw)
  }
  if (filter.direction) {
    where.push('t.direction = ?')
    params.push(filter.direction)
  }
  if (filter.accountId) {
    where.push('t.account_id = ?')
    params.push(filter.accountId)
  }
  if (filter.contractId) {
    where.push('t.contract_id = ?')
    params.push(filter.contractId)
  }
  if (filter.from) {
    where.push('t.txn_date >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    where.push('t.txn_date <= ?')
    params.push(filter.to)
  }

  const limit = filter.limit && filter.limit > 0 ? `LIMIT ${Math.floor(filter.limit)}` : ''

  return queryAll<TransactionRow>(
    `SELECT t.*, a.name AS account_name, a.account_type,
       c.title AS contract_title, c.contract_no, s.label AS schedule_label
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN contracts c ON c.id = t.contract_id
     LEFT JOIN schedules s ON s.id = t.schedule_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.txn_date DESC, t.id DESC
     ${limit}`,
    params,
  )
}

/** 单条流水 */
export function getTransaction(id: number): Transaction | null {
  return queryOne<Transaction>('SELECT * FROM transactions WHERE id = ?', [id])
}

/** 新建流水，若核销了计划则同步重算计划状态 */
export function createTransaction(input: TransactionInput): number {
  const id = update(
    `INSERT INTO transactions
      (account_id, direction, amount, txn_date, category_l1, category_l2, contract_id, schedule_id,
       counterparty, note, voucher_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.account_id,
      input.direction,
      input.amount,
      input.txn_date,
      input.category_l1 || null,
      input.category_l2 || null,
      input.contract_id ?? null,
      input.schedule_id ?? null,
      input.counterparty || null,
      input.note || null,
      input.voucher_path || null,
    ],
  )
  if (input.schedule_id) recalcSchedule(input.schedule_id)
  return id
}

/** 更新流水：换绑计划时同时重算新旧计划 */
export function updateTransaction(id: number, input: TransactionInput): void {
  const old = getTransaction(id)
  if (!old) throw new Error('流水不存在')

  update(
    `UPDATE transactions SET account_id = ?, direction = ?, amount = ?, txn_date = ?, category_l1 = ?,
       category_l2 = ?, contract_id = ?, schedule_id = ?, counterparty = ?, note = ?, voucher_path = ?
     WHERE id = ?`,
    [
      input.account_id,
      input.direction,
      input.amount,
      input.txn_date,
      input.category_l1 || null,
      input.category_l2 || null,
      input.contract_id ?? null,
      input.schedule_id ?? null,
      input.counterparty || null,
      input.note || null,
      input.voucher_path || null,
      id,
    ],
  )

  if (old.schedule_id && old.schedule_id !== input.schedule_id) recalcSchedule(old.schedule_id)
  if (input.schedule_id) recalcSchedule(input.schedule_id)
}

/** 软删除流水并重算关联计划 */
export function softDeleteTransaction(id: number): void {
  const old = getTransaction(id)
  update(`UPDATE transactions SET deleted_at = datetime('now','localtime') WHERE id = ?`, [id])
  if (old?.schedule_id) recalcSchedule(old.schedule_id)
}

/** 恢复流水 */
export function restoreTransaction(id: number): void {
  const old = getTransaction(id)
  update('UPDATE transactions SET deleted_at = NULL WHERE id = ?', [id])
  if (old?.schedule_id) recalcSchedule(old.schedule_id)
}

/** 彻底删除流水 */
export function purgeTransaction(id: number): void {
  const old = getTransaction(id)
  update('DELETE FROM transactions WHERE id = ?', [id])
  if (old?.schedule_id) recalcSchedule(old.schedule_id)
}

/** 已软删除的流水（回收站，P1 使用） */
export function listDeletedTransactions(): TransactionRow[] {
  return queryAll<TransactionRow>(
    `SELECT t.*, a.name AS account_name, c.title AS contract_title, c.contract_no, s.label AS schedule_label
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN contracts c ON c.id = t.contract_id
     LEFT JOIN schedules s ON s.id = t.schedule_id
     WHERE t.deleted_at IS NOT NULL
     ORDER BY t.deleted_at DESC`,
  )
}

/** 单独更新凭证路径（新增时先拿到自增 ID 再归档附件） */
export function setTransactionVoucher(id: number, path: string | null): void {
  update('UPDATE transactions SET voucher_path = ? WHERE id = ?', [path, id])
}

/** 合同下可用（未结清）的计划，供流水表单选择 */
export function listOpenSchedulesByContract(contractId: number, direction: Direction): { id: number; label: string | null; due_date: string | null; remaining: number }[] {
  return queryAll<{ id: number; label: string | null; due_date: string | null; remaining: number }>(
    `SELECT id, label, due_date, planned_amount - actual_amount AS remaining
     FROM schedules
     WHERE contract_id = ? AND direction = ? AND status IN ('pending','partial','overdue')
     ORDER BY due_date IS NULL, due_date ASC`,
    [contractId, direction],
  )
}
