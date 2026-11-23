// 发票仓储（P1 功能，合同详情内可用；一级菜单暂不开放）
import { queryAll, queryOne, update } from '../database'
import type { Invoice, InvoiceDirection, InvoiceStatus } from '@/types/models'

export interface InvoiceInput {
  invoice_no: string | null
  direction: InvoiceDirection
  amount: number
  tax_rate: number
  invoice_date: string | null
  contract_id: number | null
  transaction_id: number | null
  status: InvoiceStatus
  attachment_path: string | null
  note: string | null
}

export interface InvoiceFilter {
  contractId?: number
  direction?: InvoiceDirection | ''
  keyword?: string
  status?: InvoiceStatus | ''
}

/** 发票列表 */
export function listInvoices(filter: InvoiceFilter = {}): Invoice[] {
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
  if (filter.status) {
    where.push('i.status = ?')
    params.push(filter.status)
  }
  if (filter.keyword?.trim()) {
    where.push('(i.invoice_no LIKE ? OR i.note LIKE ?)')
    const kw = `%${filter.keyword.trim()}%`
    params.push(kw, kw)
  }
  return queryAll<Invoice>(`SELECT i.* FROM invoices i WHERE ${where.join(' AND ')} ORDER BY i.invoice_date DESC, i.id DESC`, params)
}

/** 单张发票 */
export function getInvoice(id: number): Invoice | null {
  return queryOne<Invoice>('SELECT * FROM invoices WHERE id = ?', [id])
}

/** 新建发票 */
export function createInvoice(input: InvoiceInput): number {
  return update(
    `INSERT INTO invoices
      (invoice_no, direction, amount, tax_rate, invoice_date, contract_id, transaction_id, status, attachment_path, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.invoice_no || null,
      input.direction,
      input.amount,
      input.tax_rate || 0,
      input.invoice_date || null,
      input.contract_id ?? null,
      input.transaction_id ?? null,
      input.status,
      input.attachment_path || null,
      input.note || null,
    ],
  )
}

/** 更新发票 */
export function updateInvoice(id: number, input: InvoiceInput): void {
  update(
    `UPDATE invoices SET invoice_no = ?, direction = ?, amount = ?, tax_rate = ?, invoice_date = ?,
       contract_id = ?, transaction_id = ?, status = ?, attachment_path = ?, note = ?
     WHERE id = ?`,
    [
      input.invoice_no || null,
      input.direction,
      input.amount,
      input.tax_rate || 0,
      input.invoice_date || null,
      input.contract_id ?? null,
      input.transaction_id ?? null,
      input.status,
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

/** 异常票据数量（徽标预留） */
export function countAbnormalInvoices(): number {
  return queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM invoices WHERE status <> 'normal'")?.c ?? 0
}
