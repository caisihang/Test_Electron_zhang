// 分析报表与工作台汇总查询
import { queryAll, queryOne } from '../database'
import type { Direction, ScheduleRow, TransactionRow, AccountWithBalance } from '@/types/models'
import { monthRange, today } from '@/utils/format'
import { listAccounts } from './accounts'

/** 工作台汇总 */
export interface DashboardData {
  monthIncome: number
  monthExpense: number
  monthNet: number
  receivable: number
  payable: number
  totalBalance: number
  overdueCount: number
  dueSoonCount: number
  pending: ScheduleRow[]
  accounts: AccountWithBalance[]
  recent: TransactionRow[]
}

/** 工作台数据 */
export function getDashboardSummary(reminderDays = 3): DashboardData {
  const { start, end } = monthRange()

  const monthIncome =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM transactions
       WHERE deleted_at IS NULL AND direction = 'income' AND txn_date BETWEEN ? AND ?`,
      [start, end],
    )?.v ?? 0

  const monthExpense =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM transactions
       WHERE deleted_at IS NULL AND direction = 'expense' AND txn_date BETWEEN ? AND ?`,
      [start, end],
    )?.v ?? 0

  // 应收 / 应付：未结清计划的剩余金额
  const receivable =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(MAX(planned_amount - actual_amount, 0)), 0) AS v FROM schedules s
       JOIN contracts c ON c.id = s.contract_id
       WHERE c.deleted_at IS NULL AND s.direction = 'income' AND s.status <> 'settled'`,
    )?.v ?? 0

  const payable =
    queryOne<{ v: number }>(
      `SELECT COALESCE(SUM(MAX(planned_amount - actual_amount, 0)), 0) AS v FROM schedules s
       JOIN contracts c ON c.id = s.contract_id
       WHERE c.deleted_at IS NULL AND s.direction = 'expense' AND s.status <> 'settled'`,
    )?.v ?? 0

  const overdueCount =
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM schedules s JOIN contracts c ON c.id = s.contract_id
       WHERE c.deleted_at IS NULL AND s.status <> 'settled' AND s.due_date < date('now','localtime')`,
    )?.c ?? 0

  const dueSoonCount =
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM schedules s JOIN contracts c ON c.id = s.contract_id
       WHERE c.deleted_at IS NULL AND s.status <> 'settled'
         AND s.due_date >= date('now','localtime')
         AND s.due_date <= date('now','localtime', '+' || ? || ' day')`,
      [reminderDays],
    )?.c ?? 0

  const pending = queryAll<ScheduleRow>(
    `SELECT s.*, c.title AS contract_title, c.contract_no, c.counterparty
     FROM schedules s JOIN contracts c ON c.id = s.contract_id
     WHERE c.deleted_at IS NULL AND s.status <> 'settled'
       AND s.due_date <= date('now','localtime', '+' || ? || ' day')
     ORDER BY s.due_date ASC LIMIT 8`,
    [reminderDays],
  )

  const accounts = listAccounts(false)
  const totalBalance = accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0)

  const recent = queryAll<TransactionRow>(
    `SELECT t.*, a.name AS account_name, c.title AS contract_title, c.contract_no, s.label AS schedule_label
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN contracts c ON c.id = t.contract_id
     LEFT JOIN schedules s ON s.id = t.schedule_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.txn_date DESC, t.id DESC LIMIT 6`,
  )

  return {
    monthIncome,
    monthExpense,
    monthNet: monthIncome - monthExpense,
    receivable,
    payable,
    totalBalance,
    overdueCount,
    dueSoonCount,
    pending,
    accounts,
    recent,
  }
}

/** 合同执行表 */
export interface ContractExecutionRow {
  id: number
  contract_no: string
  title: string
  direction: Direction
  counterparty: string
  total_amount: number
  planned_total: number
  actual_total: number
  settled_count: number
  schedule_count: number
  open_count: number
  sign_date: string | null
  year: string
}

export function listContractExecution(year?: string): ContractExecutionRow[] {
  const params: string[] = []
  let yearWhere = ''
  if (year) {
    yearWhere = "AND strftime('%Y', COALESCE(c.sign_date, c.created_at)) = ?"
    params.push(year)
  }

  return queryAll<ContractExecutionRow>(
    `SELECT c.id, c.contract_no, c.title, c.direction, c.counterparty, c.total_amount, c.sign_date,
       strftime('%Y', COALESCE(c.sign_date, c.created_at)) AS year,
       COALESCE((SELECT SUM(s.planned_amount) FROM schedules s WHERE s.contract_id = c.id), 0) AS planned_total,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.contract_id = c.id AND t.deleted_at IS NULL), 0) AS actual_total,
       COALESCE((SELECT COUNT(*) FROM schedules s WHERE s.contract_id = c.id AND s.status = 'settled'), 0) AS settled_count,
       COALESCE((SELECT COUNT(*) FROM schedules s WHERE s.contract_id = c.id), 0) AS schedule_count,
       COALESCE((SELECT COUNT(*) FROM schedules s WHERE s.contract_id = c.id AND s.status <> 'settled'), 0) AS open_count
     FROM contracts c
     WHERE c.deleted_at IS NULL ${yearWhere}
     ORDER BY c.created_at DESC`,
    params,
  )
}

/** 收支结余表：按月汇总 */
export interface MonthlyRow {
  month: number
  income: number
  expense: number
  net: number
}

export function getMonthlySummary(year: string): { rows: MonthlyRow[]; total: MonthlyRow } {
  const rows = queryAll<{ m: string; direction: Direction; v: number }>(
    `SELECT strftime('%m', txn_date) AS m, direction, SUM(amount) AS v
     FROM transactions
     WHERE deleted_at IS NULL AND strftime('%Y', txn_date) = ?
     GROUP BY m, direction`,
    [year],
  )

  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    income: 0,
    expense: 0,
    net: 0,
  }))

  rows.forEach((row) => {
    const index = Number(row.m) - 1
    if (index < 0 || index > 11) return
    if (row.direction === 'income') months[index].income = Number(row.v)
    else months[index].expense = Number(row.v)
  })
  months.forEach((item) => {
    item.net = item.income - item.expense
  })

  const total = months.reduce(
    (acc, item) => {
      acc.income += item.income
      acc.expense += item.expense
      acc.net += item.net
      return acc
    },
    { month: 0, income: 0, expense: 0, net: 0 },
  )

  return { rows: months, total }
}

/** 分类汇总（收支结余表辅助） */
export interface CategoryTotal {
  category: string
  amount: number
  percent: number
}

export function getCategorySummary(from: string, to: string, direction: Direction): CategoryTotal[] {
  const rows = queryAll<{ name: string | null; v: number }>(
    `SELECT COALESCE(NULLIF(category_l1, ''), '未分类') AS name, SUM(amount) AS v
     FROM transactions
     WHERE deleted_at IS NULL AND direction = ? AND txn_date BETWEEN ? AND ?
     GROUP BY name ORDER BY v DESC`,
    [direction, from, to],
  )
  const total = rows.reduce((sum, row) => sum + Number(row.v), 0)
  return rows.map((row) => ({
    category: row.name ?? '未分类',
    amount: Number(row.v),
    percent: total > 0 ? Number(row.v) / total : 0,
  }))
}

/** 可选年份列表（流水 + 合同） */
export function listYears(): string[] {
  const rows = queryAll<{ y: string }>(
    `SELECT DISTINCT y FROM (
       SELECT strftime('%Y', txn_date) AS y FROM transactions WHERE deleted_at IS NULL
       UNION
       SELECT strftime('%Y', COALESCE(sign_date, created_at)) AS y FROM contracts WHERE deleted_at IS NULL
     ) WHERE y IS NOT NULL ORDER BY y DESC`,
  )
  const years = rows.map((row) => row.y)
  const current = today().slice(0, 4)
  if (!years.includes(current)) years.unshift(current)
  return years
}
