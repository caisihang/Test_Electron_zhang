// Excel 导出：生成 xlsx 字节，桌面端弹「另存为」，浏览器直接下载
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { listContracts } from '@/db/repositories/contracts'
import { listTransactions } from '@/db/repositories/transactions'
import { listSchedules } from '@/db/repositories/schedules'
import { listInvoices } from '@/db/repositories/invoices'
import { contractStatusText, directionText, scheduleStatusText, invoiceTypeText, issueStatusText } from '@/utils/format'
import { saveBytes } from './saveFile'

/** 导出合同台账 */
export async function exportContractsXlsx(): Promise<string | null> {
  const rows = listContracts().map((contract) => ({
    合同编号: contract.contract_no,
    合同名称: contract.title,
    方向: directionText[contract.direction],
    对方单位: contract.counterparty,
    签订日期: contract.sign_date ?? '',
    开始日期: contract.start_date ?? '',
    结束日期: contract.end_date ?? '',
    合同金额: contract.total_amount,
    已收付金额: contract.direction === 'income' ? contract.income_total : contract.expense_total,
    未结清计划数: contract.open_schedule_count,
    状态: contractStatusText[contract.status] ?? contract.status,
    备注: contract.note ?? '',
  }))
  return writeSheet(rows, '合同台账', '合同台账')
}

/** 导出收支流水 */
export async function exportTransactionsXlsx(): Promise<string | null> {
  const rows = listTransactions().map((txn) => ({
    日期: txn.txn_date,
    方向: directionText[txn.direction],
    金额: txn.amount,
    账户: txn.account_name,
    一级分类: txn.category_l1 ?? '',
    二级分类: txn.category_l2 ?? '',
    合同编号: txn.contract_no ?? '',
    合同名称: txn.contract_title ?? '',
    计划: txn.schedule_label ?? '',
    往来方: txn.counterparty ?? '',
    备注: txn.note ?? '',
  }))
  return writeSheet(rows, '收支流水', '收支流水')
}

/** 导出收付款计划 */
export async function exportSchedulesXlsx(): Promise<string | null> {
  const rows = listSchedules().map((schedule) => ({
    合同编号: schedule.contract_no,
    合同名称: schedule.contract_title,
    方向: directionText[schedule.direction],
    计划名称: schedule.label ?? '',
    到期日: schedule.due_date ?? '',
    计划金额: schedule.planned_amount,
    已收付金额: schedule.actual_amount,
    剩余金额: Math.max(schedule.planned_amount - schedule.actual_amount, 0),
    状态: scheduleStatusText[schedule.status] ?? schedule.status,
  }))
  return writeSheet(rows, '收付款计划', '收付款计划')
}

/** 导出发票台账 */
export async function exportInvoicesXlsx(): Promise<string | null> {
  const rows = listInvoices().map((invoice) => ({
    发票号: invoice.invoice_no ?? '',
    发票类型: invoiceTypeText[invoice.invoice_type],
    开票状态: issueStatusText[invoice.issue_status],
    收付方向: invoice.direction === 'issued' ? '开出' : '收到',
    金额: invoice.amount,
    税率: invoice.tax_rate,
    开票日期: invoice.invoice_date ?? '',
    关联合同: invoice.contract_no ? `${invoice.contract_no} ${invoice.contract_title ?? ''}`.trim() : '',
    备注: invoice.note ?? '',
  }))
  return writeSheet(rows, '发票台账', '发票台账')
}

/** 通用单人表导出：生成字节后走统一保存流程 */
async function writeSheet(
  rows: Record<string, unknown>[],
  sheetName: string,
  filePrefix: string,
): Promise<string | null> {
  if (rows.length === 0) throw new Error('暂无可导出的数据')
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const headers = Object.keys(rows[0])
  worksheet['!cols'] = headers.map((key) => ({ wch: Math.max(key.length * 2 + 4, 12) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  // type: 'array' 拿到 Uint8Array，交给 saveBytes 统一处理
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const fileName = `${filePrefix}-${dayjs().format('YYYYMMDD-HHmm')}.xlsx`
  return saveBytes(fileName, new Uint8Array(buffer), [
    { name: 'Excel 工作簿', extensions: ['xlsx'] },
  ])
}
