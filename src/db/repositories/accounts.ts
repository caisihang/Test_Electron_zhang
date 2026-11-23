// 账户仓储
import { queryAll, queryOne, update } from '../database'
import type { AccountType, AccountWithBalance } from '@/types/models'

export interface AccountInput {
  name: string
  account_type: AccountType
  initial_balance: number
  currency?: string
}

/** 账户列表（含实时余额） */
export function listAccounts(includeArchived = false): AccountWithBalance[] {
  const where = includeArchived ? '' : 'WHERE a.is_archived = 0'
  return queryAll<AccountWithBalance>(
    `SELECT a.*,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'income'), 0) AS income_total,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'expense'), 0) AS expense_total,
       a.initial_balance
         + COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'income'), 0)
         - COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'expense'), 0) AS balance
     FROM accounts a
     ${where}
     ORDER BY a.is_archived ASC, a.id ASC`,
  )
}

/** 单个账户 */
export function getAccount(id: number): AccountWithBalance | null {
  return queryOne<AccountWithBalance>(
    `SELECT a.*,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'income'), 0) AS income_total,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'expense'), 0) AS expense_total,
       a.initial_balance
         + COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'income'), 0)
         - COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.account_id = a.id AND t.deleted_at IS NULL AND t.direction = 'expense'), 0) AS balance
     FROM accounts a WHERE a.id = ?`,
    [id],
  )
}

/** 新建账户 */
export function createAccount(input: AccountInput): number {
  return update(
    'INSERT INTO accounts (name, account_type, initial_balance, currency) VALUES (?, ?, ?, ?)',
    [input.name.trim(), input.account_type, input.initial_balance || 0, input.currency || 'CNY'],
  )
}

/** 更新账户 */
export function updateAccount(id: number, input: AccountInput): void {
  update('UPDATE accounts SET name = ?, account_type = ?, initial_balance = ?, currency = ? WHERE id = ?', [
    input.name.trim(),
    input.account_type,
    input.initial_balance || 0,
    input.currency || 'CNY',
    id,
  ])
}

/** 归档 / 取消归档 */
export function setAccountArchived(id: number, archived: boolean): void {
  update('UPDATE accounts SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id])
}

/** 账户是否被流水引用 */
export function accountTransactionCount(id: number): number {
  return queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM transactions WHERE account_id = ? AND deleted_at IS NULL',
    [id],
  )?.c ?? 0
}
