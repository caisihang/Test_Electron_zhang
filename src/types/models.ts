// 业务模型类型定义（与 README 数据模型保持一致）

export type Direction = 'income' | 'expense'
export type ContractStatus = 'draft' | 'active' | 'completed' | 'terminated'
export type ScheduleStatus = 'pending' | 'partial' | 'settled' | 'overdue'
export type AccountType = 'bank' | 'wechat' | 'alipay' | 'cash'
export type InvoiceDirection = 'issued' | 'received'
export type InvoiceStatus = 'normal' | 'missing_payment' | 'missing_invoice'

/** 账户 */
export interface Account {
  id: number
  name: string
  account_type: AccountType
  initial_balance: number
  currency: string
  is_archived: number
  created_at: string
}

/** 账户 + 计算余额 */
export interface AccountWithBalance extends Account {
  balance: number
  income_total: number
  expense_total: number
}

/** 合同 */
export interface Contract {
  id: number
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
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 合同 + 汇总字段（台账列表用） */
export interface ContractRow extends Contract {
  income_total: number
  expense_total: number
  open_schedule_count: number
}

/** 收付款计划 */
export interface Schedule {
  id: number
  contract_id: number
  direction: Direction
  label: string | null
  due_date: string
  planned_amount: number
  actual_amount: number
  status: ScheduleStatus
  sort_order: number
  created_at: string
}

/** 计划 + 合同信息（计划列表用） */
export interface ScheduleRow extends Schedule {
  contract_title: string
  contract_no: string
  counterparty: string
}

/** 流水 */
export interface Transaction {
  id: number
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
  created_at: string
  deleted_at: string | null
}

/** 流水 + 关联名称（流水列表用） */
export interface TransactionRow extends Transaction {
  account_name: string
  contract_title: string | null
  contract_no: string | null
  schedule_label: string | null
}

/** 合同变更历史 */
export interface ContractChange {
  id: number
  contract_id: number
  field_name: string
  old_value: string | null
  new_value: string | null
  reason: string | null
  changed_at: string
}

/** 发票（P1，合同详情内可用） */
export interface Invoice {
  id: number
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
  created_at: string
}

/** 分类 */
export interface Category {
  id: number
  parent_id: number | null
  name: string
  direction: Direction
  sort_order: number
}

/** 分类树节点 */
export interface CategoryNode extends Category {
  children: CategoryNode[]
}

/** 核销候选 */
export interface ReconcileCandidate {
  schedule_id: number
  contract_title: string
  contract_no: string
  label: string | null
  due_date: string
  planned_amount: number
  actual_amount: number
  remaining: number
  score: number
}

/** 附件元数据（Web 模式下文件保存在 IndexedDB） */
export interface AttachmentMeta {
  path: string
  name: string
  size: number
  mime: string
  created_at: string
}

/** 备份记录 */
export interface BackupMeta {
  id: string
  created_at: string
  size: number
  auto: boolean
  file_name: string
}
