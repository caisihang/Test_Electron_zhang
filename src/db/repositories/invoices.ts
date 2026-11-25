// 发票仓储：普票/专票、已开/未开，按合同统计开票进度
import { queryAll, queryOne, update } from '../database'
import type {
  Invoice,
  InvoiceDirection,
  InvoiceIssueStatus,
  InvoiceRow,
  InvoiceStatus,
  InvoiceType,
} from '@/types/models'

export interface InvoiceInput {
  invoice_no: string | null
  direction: InvoiceDirection
  amount: number
  tax_rate: number
  invoice_date: string | null
  contract_id: number | null
  transaction_id: number | null
  invoice_type: InvoiceType
  issue_status: InvoiceIssueStatus
  attachment_path: string | null
  note: string | null
}

export interface InvoiceFilter {
  contractId?: number
  direction?: InvoiceDirection | ''
  keyword?: string
  issueStatus?: InvoiceIssueStatus | ''
  invoiceType?: InvoiceType | ''
  from?: string
  to?: string
}

/** 发票列表（带合同编号与名称） */
export function listInvoices(filter: InvoiceFilter = {}): InvoiceRow[] {
  const where: string[] = ['1 = 1']
  const params: (string | number)[] = []
  if (filter.contractId) {
    where.push('i.contract_id = ?')
    params.push(filter.contractId)
  }
  if (filter.direction) {
    where.push('i.direction = ?')
    params.push(filter.direction)
  }
  if (filter.issueStatus) {
    where.push('i.issue_status = ?')
    params.push(filter.issueStatus)
  }
  if (filter.invoiceType) {
    where.push('i.invoice_type = ?')
    params.push(filter.invoiceType)
  }
  if (filter.keyword?.trim()) {
    where.push('(i.invoice_no LIKE ? OR i.note LIKE ? OR c.title LIKE ? OR c.contract_no LIKE ?)')
    const kw = `%${filter.keyword.trim()}%`
    params.push(kw, kw, kw, kw)
  }
  if (filter.from) {
    where.push('i.invoice_date >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    where.push('i.invoice_date <= ?')
    params.push(filter.to)
  }
  return queryAll<InvoiceRow>(
    `SELECT i.*, c.contract_no, c.title AS contract_title, c.direction AS contract_direction
     FROM invoices i
     LEFT JOIN contracts c ON c.id = i.contract_id
     WHERE ${where.join(' AND ')}
     ORDER BY i.invoice_date DESC, i.id DESC`,
    params,
  )
}

/** 单张发票 */
export function getInvoice(id: number): Invoice | null {
  return queryOne<Invoice>('SELECT * FROM invoices WHERE id = ?', [id])
}

/** 新建发票（旧 status 字段仅保留兼容，固定 normal） */
export function createInvoice(input: InvoiceInput): number {
  return update(
    `INSERT INTO invoices
      (invoice_no, direction, amount, tax_rate, invoice_date, contract_id, transaction_id,
       status, invoice_type, issue_status, attachment_path, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.invoice_no || null,
      input.direction,
      input.amount,
      input.tax_rate || 0,
      input.invoice_date || null,
      input.contract_id ?? null,
      input.transaction_id ?? null,
      'normal' as InvoiceStatus,
      input.invoice_type,
      input.issue_status,
      input.attachment_path || null,
      input.note || null,
    ],
  )
}

/** 更新发票 */
export function updateInvoice(id: number, input: InvoiceInput): void {
  update(
    `UPDATE invoices SET invoice_no = ?, direction = ?, amount = ?, tax_rate = ?, invoice_date = ?,
       contract_id = ?, transaction_id = ?, invoice_type = ?, issue_status = ?,
       attachment_path = ?, note = ?
     WHERE id = ?`,
    [
      input.invoice_no || null,
      input.direction,
      input.amount,
      input.tax_rate || 0,
      input.invoice_date || null,
      input.contract_id ?? null,
      input.transaction_id ?? null,
      input.invoice_type,
      input.issue_status,
      input.attachment_path || null,
      input.note || null,
      id,
    ],
  )
}

/** 删除发票 */
export function deleteInvoice(id: number): void {
  update('DELETE FROM invoices WHERE id = ?', [id])
}

/** 发票汇总（列表页顶部卡片） */
export interface InvoiceSummary {
  /** 已开票金额合计 */
  issuedAmount: number
  /** 未开票金额合计（按张统计未开票金额） */
  notIssuedAmount: number
  /** 已开票张数 */
  issuedCount: number
  /** 未开票张数 */
  notIssuedCount: number
  /** 尚未开满的合同数（合同金额 > 已开票合计） */
  pendingContractCount: number
}

/** 发票汇总：整体口径 + 待开票合同数 */
export function getInvoiceSummary(): InvoiceSummary {
  const issued =
    queryOne<{ amount: number; c: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS c FROM invoices WHERE issue_status = 'issued'",
    ) ?? { amount: 0, c: 0 }
  const notIssued =
    queryOne<{ amount: number; c: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS c FROM invoices WHERE issue_status = 'not_issued'",
    ) ?? { amount: 0, c: 0 }
  // 合同闭环：已开票合计小于合同金额的合同数量
  const pendingContractCount =
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM contracts c
       WHERE c.deleted_at IS NULL AND c.total_amount > 0
         AND c.total_amount > COALESCE(
           (SELECT SUM(i.amount) FROM invoices i
            WHERE i.contract_id = c.id AND i.issue_status = 'issued'), 0)`,
    )?.c ?? 0

  return {
    issuedAmount: Number(issued.amount ?? 0),
    notIssuedAmount: Number(notIssued.amount ?? 0),
    issuedCount: Number(issued.c ?? 0),
    notIssuedCount: Number(notIssued.c ?? 0),
    pendingContractCount,
  }
}

/** 单合同开票进度（合同详情发票 Tab 顶部） */
export interface ContractInvoiceStat {
  issuedAmount: number
  remaining: number
  progress: number
  issuedCount: number
  notIssuedCount: number
}

export function getContractInvoiceStat(contractId: number, contractAmount: number): ContractInvoiceStat {
  const issued =
    queryOne<{ amount: number; c: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS c FROM invoices WHERE contract_id = ? AND issue_status = 'issued'",
      [contractId],
    ) ?? { amount: 0, c: 0 }
  const notIssuedCount =
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM invoices WHERE contract_id = ? AND issue_status = 'not_issued'",
      [contractId],
    )?.c ?? 0

  const issuedAmount = Number(issued.amount ?? 0)
  return {
    issuedAmount,
    remaining: Math.max(contractAmount - issuedAmount, 0),
    progress: contractAmount > 0 ? Math.min(issuedAmount / contractAmount, 1) : 0,
    issuedCount: Number(issued.c ?? 0),
    notIssuedCount: Number(notIssuedCount),
  }
}

/** 异常票据数量（旧逻辑保留，供徽标兼容） */
export function countAbnormalInvoices(): number {
  return queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM invoices WHERE status <> 'normal'")?.c ?? 0
}
