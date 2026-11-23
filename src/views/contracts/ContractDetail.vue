<script setup lang="ts">
// 合同详情：计划 / 流水 / 发票 / 变更 / 附件 五个 Tab
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import ContractFormModal from '@/components/ContractFormModal.vue'
import {
  getContract,
  getContractProgress,
  listContractChanges,
  type ContractProgress,
} from '@/db/repositories/contracts'
import {
  createSchedule,
  deleteSchedule,
  generateSchedules,
  listSchedules,
  updateSchedule,
} from '@/db/repositories/schedules'
import { listTransactions } from '@/db/repositories/transactions'
import { createInvoice, deleteInvoice, listInvoices, updateInvoice } from '@/db/repositories/invoices'
import type { Contract, Invoice, InvoiceDirection, InvoiceStatus, ScheduleRow, TransactionRow } from '@/types/models'
import {
  confirmAction,
} from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import {
  contractStatusText,
  directionText,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatMoney,
  invoiceDirectionText,
  invoiceStatusText,
  ratio,
  scheduleStatusText,
  today,
} from '@/utils/format'
import {
  attachmentName,
  deleteAttachment,
  getAttachmentUrl,
  importAttachment,
  importAttachmentFromPath,
  isPreviewable,
  listAttachmentsByPrefix,
  openAttachment,
} from '@/services/attachment'
// 桌面端：附件选择走原生对话框；时间戳为秒数时需要单独格式化
import { isTauri } from '@/services/tauri'
import { formatStamp } from '@/services/folder'
import type { AttachmentMeta } from '@/types/models'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const contractId = Number(route.params.id)
const contract = ref<Contract | null>(null)
const progress = ref<ContractProgress>({
  planned_total: 0,
  income_total: 0,
  expense_total: 0,
  settled_count: 0,
  total_count: 0,
})
const schedules = ref<ScheduleRow[]>([])
const transactions = ref<TransactionRow[]>([])
const invoices = ref<Invoice[]>([])
const changes = ref<Awaited<ReturnType<typeof listContractChanges>>>([])
const attachments = ref<AttachmentMeta[]>([])
const attachmentUrls = reactive<Record<string, string>>({})

const activeTab = ref<'schedules' | 'transactions' | 'invoices' | 'changes' | 'attachments'>('schedules')
const showContractForm = ref(false)
const showScheduleForm = ref(false)
const editingScheduleId = ref<number | null>(null)
const showGenerate = ref(false)
const showInvoiceForm = ref(false)
const editingInvoiceId = ref<number | null>(null)

// 计划表单
const scheduleForm = reactive({ label: '进度款', due_date: today(), planned_amount: 0 })
// 批量生成计划
const genRows = ref<{ label: string; percent: number; due_date: string }[]>([])

// 发票表单
const invoiceForm = reactive({
  invoice_no: '',
  direction: 'issued' as InvoiceDirection,
  amount: 0,
  tax_rate: 0,
  invoice_date: today(),
  status: 'normal' as InvoiceStatus,
  note: '',
})

const contractAmount = computed(() => contract.value?.total_amount ?? 0)
const actualTotal = computed(() =>
  contract.value?.direction === 'income' ? progress.value.income_total : progress.value.expense_total,
)
const execRate = computed(() => ratio(actualTotal.value, contractAmount.value))
const currentDirectionText = computed(() => (contract.value ? directionText[contract.value.direction] : ''))
const plannedDiff = computed(() => progress.value.planned_total - contractAmount.value)
const genPercentTotal = computed(() => genRows.value.reduce((sum, row) => sum + Number(row.percent || 0), 0))

async function load(): Promise<void> {
  contract.value = getContract(contractId)
  if (!contract.value) return
  progress.value = getContractProgress(contractId)
  schedules.value = listSchedules({ contractId })
  transactions.value = listTransactions({ contractId })
  invoices.value = listInvoices({ contractId })
  changes.value = listContractChanges(contractId)
  attachments.value = await listAttachmentsByPrefix(`contract/${contractId}/`)
  for (const item of attachments.value) {
    if (isPreviewable(item.mime)) {
      attachmentUrls[item.path] = await getAttachmentUrl(item.path)
    }
  }
}

onMounted(() => {
  void load()
})

function reloadAndBadges(): void {
  void load()
  store.refreshBadges()
}

// ---------- 计划 ----------
function openScheduleCreate(): void {
  editingScheduleId.value = null
  scheduleForm.label = '进度款'
  scheduleForm.due_date = contract.value?.end_date || today()
  scheduleForm.planned_amount = Math.max(contractAmount.value - progress.value.planned_total, 0)
  showScheduleForm.value = true
}

function openScheduleEdit(schedule: ScheduleRow): void {
  editingScheduleId.value = schedule.id
  scheduleForm.label = schedule.label ?? ''
  scheduleForm.due_date = schedule.due_date
  scheduleForm.planned_amount = schedule.planned_amount
  showScheduleForm.value = true
}

function submitSchedule(): void {
  if (!scheduleForm.due_date) {
    store.showToast('请选择到期日', 'error')
    return
  }
  if (Number(scheduleForm.planned_amount) <= 0) {
    store.showToast('计划金额需大于 0', 'error')
    return
  }
  if (editingScheduleId.value) {
    const current = schedules.value.find((row) => row.id === editingScheduleId.value)
    updateSchedule(editingScheduleId.value, {
      label: scheduleForm.label || null,
      due_date: scheduleForm.due_date,
      planned_amount: Number(scheduleForm.planned_amount),
      sort_order: current?.sort_order ?? 0,
    })
  } else {
    createSchedule({
      contract_id: contractId,
      label: scheduleForm.label || null,
      due_date: scheduleForm.due_date,
      planned_amount: Number(scheduleForm.planned_amount),
    })
  }
  showScheduleForm.value = false
  reloadAndBadges()
  store.showToast('计划已保存')
}

async function removeSchedule(schedule: ScheduleRow): Promise<void> {
  const ok = await confirmAction({
    title: '删除计划',
    message: `确定删除「${schedule.label || '计划'}」吗？已有关联流水的计划不能删除。`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  try {
    deleteSchedule(schedule.id)
    reloadAndBadges()
    store.showToast('计划已删除')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

// 打开“按比例生成计划”，默认 30/50/20 三期
function openGenerate(): void {
  const total = contractAmount.value
  const start = contract.value?.start_date || today()
  const end = contract.value?.end_date || dayjs(start).add(6, 'month').format('YYYY-MM-DD')
  const mid = dayjs(start).add(dayjs(end).diff(dayjs(start), 'day') / 2, 'day').format('YYYY-MM-DD')
  genRows.value = [
    { label: '预付款', percent: 30, due_date: start },
    { label: '进度款', percent: 50, due_date: mid },
    { label: '尾款', percent: 20, due_date: end },
  ].map((row) => ({ ...row, due_date: row.due_date }))
  if (total <= 0) store.showToast('合同金额为 0，生成后请手动调整计划金额', 'info')
  showGenerate.value = true
}

function addGenRow(): void {
  genRows.value.push({ label: '进度款', percent: 0, due_date: today() })
}

function removeGenRow(index: number): void {
  genRows.value.splice(index, 1)
}

function genAmount(percent: number): number {
  return Math.round(contractAmount.value * (Number(percent) || 0)) / 100
}

async function submitGenerate(): Promise<void> {
  if (genRows.value.length === 0) {
    store.showToast('至少保留一期计划', 'error')
    return
  }
  if (schedules.value.length > 0) {
    const ok = await confirmAction({
      title: '追加计划',
      message: '该合同已有计划，继续生成会追加新的计划，不会覆盖已有数据。',
      confirmText: '继续追加',
    })
    if (!ok) return
  }
  const items = genRows.value
    .filter((row) => Number(row.percent) > 0)
    .map((row) => ({
      contract_id: contractId,
      label: row.label || null,
      due_date: row.due_date,
      planned_amount: genAmount(row.percent),
    }))
  if (items.length === 0) {
    store.showToast('请至少填写一期比例', 'error')
    return
  }
  generateSchedules(contractId, items)
  showGenerate.value = false
  reloadAndBadges()
  store.showToast(`已生成 ${items.length} 期计划`)
}

// ---------- 流水 ----------
function goNewTransaction(): void {
  router.push({ path: '/transactions', query: { contractId: String(contractId), new: '1' } })
}

function goTransactionList(): void {
  router.push({ path: '/transactions', query: { contractId: String(contractId) } })
}

// ---------- 发票 ----------
function openInvoiceCreate(): void {
  editingInvoiceId.value = null
  invoiceForm.invoice_no = ''
  invoiceForm.direction = contract.value?.direction === 'expense' ? 'received' : 'issued'
  invoiceForm.amount = contractAmount.value
  invoiceForm.tax_rate = 0
  invoiceForm.invoice_date = today()
  invoiceForm.status = 'normal'
  invoiceForm.note = ''
  showInvoiceForm.value = true
}

function openInvoiceEdit(invoice: Invoice): void {
  editingInvoiceId.value = invoice.id
  invoiceForm.invoice_no = invoice.invoice_no ?? ''
  invoiceForm.direction = invoice.direction
  invoiceForm.amount = invoice.amount
  invoiceForm.tax_rate = invoice.tax_rate
  invoiceForm.invoice_date = invoice.invoice_date ?? ''
  invoiceForm.status = invoice.status
  invoiceForm.note = invoice.note ?? ''
  showInvoiceForm.value = true
}

function submitInvoice(): void {
  if (Number(invoiceForm.amount) <= 0) {
    store.showToast('发票金额需大于 0', 'error')
    return
  }
  const payload = {
    invoice_no: invoiceForm.invoice_no || null,
    direction: invoiceForm.direction,
    amount: Number(invoiceForm.amount),
    tax_rate: Number(invoiceForm.tax_rate) || 0,
    invoice_date: invoiceForm.invoice_date || null,
    contract_id: contractId,
    transaction_id: null,
    status: invoiceForm.status,
    attachment_path: null,
    note: invoiceForm.note || null,
  }
  if (editingInvoiceId.value) updateInvoice(editingInvoiceId.value, payload)
  else createInvoice(payload)
  showInvoiceForm.value = false
  void load()
  store.showToast('发票已保存')
}

async function removeInvoice(invoice: Invoice): Promise<void> {
  const ok = await confirmAction({ title: '删除发票', message: '确定删除这张发票记录吗？', danger: true, confirmText: '删除' })
  if (!ok) return
  deleteInvoice(invoice.id)
  void load()
  store.showToast('发票已删除')
}

// ---------- 附件 ----------
const uploading = ref(false)
const desktop = isTauri()

async function onFilesSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  uploading.value = true
  try {
    for (const file of Array.from(input.files)) {
      await importAttachment(file, 'contract', contractId)
    }
    await load()
    store.showToast('附件已上传')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

/** 桌面端：原生对话框选择附件后按路径复制 */
async function pickAndUpload(): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({
      multiple: true,
      title: '选择合同附件',
      filters: [
        {
          name: '合同文件',
          extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'],
        },
      ],
    })
    if (!picked) return
    const paths = Array.isArray(picked) ? picked : [picked]
    uploading.value = true
    for (const path of paths) {
      await importAttachmentFromPath(path, 'contract', contractId)
    }
    await load()
    store.showToast('附件已上传')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  } finally {
    uploading.value = false
  }
}

/** 秒级时间戳与 ISO 字符串都兼容 */
function attachmentTime(value: string): string {
  return /^\d+$/.test(value) ? formatStamp(Number(value)) : formatDate(value)
}

async function previewAttachment(item: AttachmentMeta): Promise<void> {
  const url = attachmentUrls[item.path] ?? (await getAttachmentUrl(item.path))
  if (!url) return
  window.open(url, '_blank')
}

async function removeAttachment(item: AttachmentMeta): Promise<void> {
  const ok = await confirmAction({ title: '删除附件', message: `确定删除「${item.name}」吗？`, danger: true, confirmText: '删除' })
  if (!ok) return
  await deleteAttachment(item.path)
  delete attachmentUrls[item.path]
  attachments.value = await listAttachmentsByPrefix(`contract/${contractId}/`)
  store.showToast('附件已删除')
}

function scheduleTagClass(status: string): string {
  if (status === 'settled') return 'tag-green'
  if (status === 'overdue') return 'tag-red'
  if (status === 'partial') return 'tag-amber'
  return 'tag-gray'
}

function back(): void {
  router.push('/contracts')
}
</script>

<template>
  <div v-if="contract">
    <div class="page-header" style="margin-bottom: 12px">
      <button class="btn btn-sm" type="button" @click="back">← 返回台账</button>
    </div>

    <!-- 合同概览 -->
    <div class="card">
      <div class="card-body">
        <div style="display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap">
          <div style="min-width: 260px; flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <h2 style="font-size: 18px; font-weight: 650">{{ contract.title }}</h2>
              <span class="tag" :class="contract.direction === 'income' ? 'tag-income' : 'tag-expense'">
                {{ currentDirectionText }}
              </span>
              <span class="tag" :class="contract.status === 'active' ? 'tag-blue' : 'tag-gray'">
                {{ contractStatusText[contract.status] }}
              </span>
            </div>
            <div class="text-muted text-sm" style="margin-top: 6px">
              {{ contract.contract_no }} · {{ contract.counterparty }} · 签订 {{ formatDate(contract.sign_date) }}
            </div>
            <div class="text-dim text-sm" style="margin-top: 3px">
              合同期：{{ formatDate(contract.start_date) }} 至 {{ formatDate(contract.end_date) }}
            </div>
          </div>
          <div style="display: flex; gap: 8px">
            <button class="btn" type="button" @click="goNewTransaction">记一笔</button>
            <button class="btn" type="button" @click="showContractForm = true">编辑合同</button>
          </div>
        </div>

        <div class="stat-grid" style="margin-top: 16px">
          <div class="stat-card" style="box-shadow: none; background: var(--panel-2)">
            <div class="stat-label">合同金额</div>
            <div class="stat-value" style="font-size: 20px">{{ formatMoney(contractAmount) }}</div>
          </div>
          <div class="stat-card" style="box-shadow: none; background: var(--panel-2)">
            <div class="stat-label">已{{ contract.direction === 'income' ? '收' : '付' }}</div>
            <div class="stat-value" :class="contract.direction === 'income' ? 'green' : 'red'" style="font-size: 20px">
              {{ formatMoney(actualTotal) }}
            </div>
          </div>
          <div class="stat-card" style="box-shadow: none; background: var(--panel-2)">
            <div class="stat-label">执行进度</div>
            <div class="stat-value primary" style="font-size: 20px">{{ (execRate * 100).toFixed(1) }}%</div>
            <div class="progress" style="margin-top: 8px">
              <div class="progress-bar" :style="{ width: Math.min(execRate * 100, 100) + '%' }"></div>
            </div>
          </div>
          <div class="stat-card" style="box-shadow: none; background: var(--panel-2)">
            <div class="stat-label">计划完成</div>
            <div class="stat-value" style="font-size: 20px">
              {{ progress.settled_count }} / {{ progress.total_count }}
            </div>
            <div class="stat-hint">计划合计 {{ formatMoney(progress.planned_total) }}</div>
          </div>
        </div>

        <div v-if="Math.abs(plannedDiff) > 0.01" class="hint-box" style="margin-top: 12px">
          计划合计与合同金额相差 {{ formatMoney(Math.abs(plannedDiff)) }}（
          {{ plannedDiff > 0 ? '计划多于合同金额' : '计划少于合同金额' }} ），请检查分期设置。
        </div>
        <div v-if="contract.note" class="hint-box" style="margin-top: 12px">备注：{{ contract.note }}</div>
      </div>
    </div>

    <!-- 五个 Tab -->
    <div class="card" style="margin-top: 16px">
      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'schedules' }" type="button" @click="activeTab = 'schedules'">
          收付款计划 <span class="tab-count">{{ schedules.length }}</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'transactions' }" type="button" @click="activeTab = 'transactions'">
          流水 <span class="tab-count">{{ transactions.length }}</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'invoices' }" type="button" @click="activeTab = 'invoices'">
          发票 <span class="tab-count">{{ invoices.length }}</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'changes' }" type="button" @click="activeTab = 'changes'">
          变更 <span class="tab-count">{{ changes.length }}</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'attachments' }" type="button" @click="activeTab = 'attachments'">
          附件 <span class="tab-count">{{ attachments.length }}</span>
        </button>
      </div>

      <!-- 计划 -->
      <div v-if="activeTab === 'schedules'" class="card-body tight tab-pane">
        <div class="toolbar" style="padding: 14px 18px 0">
          <button class="btn btn-sm btn-primary" type="button" @click="openScheduleCreate">
            <NavIcon name="plus" :size="13" /> 添加计划
          </button>
          <button class="btn btn-sm" type="button" @click="openGenerate">按比例生成</button>
          <div class="toolbar-spacer"></div>
          <span class="text-dim text-sm">两处数据同源：这里与一级菜单「收付款计划」</span>
        </div>
        <div v-if="schedules.length === 0" class="empty">
          <strong>还没有收付款计划</strong>
          可按 30 / 50 / 20 的比例快速生成，再逐期微调
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>期次</th>
                <th>名称</th>
                <th>到期日</th>
                <th class="num">计划金额</th>
                <th class="num">已{{ contract.direction === 'income' ? '收' : '付' }}</th>
                <th class="num">剩余</th>
                <th>状态</th>
                <th class="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(schedule, index) in schedules" :key="schedule.id">
                <td>{{ index + 1 }}</td>
                <td>{{ schedule.label || '—' }}</td>
                <td>{{ formatDate(schedule.due_date) }}</td>
                <td class="num">{{ formatMoney(schedule.planned_amount) }}</td>
                <td class="num">{{ formatMoney(schedule.actual_amount) }}</td>
                <td class="num">{{ formatMoney(Math.max(schedule.planned_amount - schedule.actual_amount, 0)) }}</td>
                <td><span class="tag" :class="scheduleTagClass(schedule.status)">{{ scheduleStatusText[schedule.status] }}</span></td>
                <td class="actions">
                  <button class="btn btn-link" type="button" @click="openScheduleEdit(schedule)">编辑</button>
                  <button class="btn btn-link danger" type="button" @click="removeSchedule(schedule)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 流水 -->
      <div v-if="activeTab === 'transactions'" class="card-body tight tab-pane">
        <div class="toolbar" style="padding: 14px 18px 0">
          <button class="btn btn-sm btn-primary" type="button" @click="goNewTransaction">记一笔</button>
          <div class="toolbar-spacer"></div>
          <button class="btn btn-sm" type="button" @click="goTransactionList">在流水页查看</button>
        </div>
        <div v-if="transactions.length === 0" class="empty">
          <strong>还没有关联流水</strong>
          记录真实收付后，计划会自动核销
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>方向</th>
                <th class="num">金额</th>
                <th>账户</th>
                <th>分类</th>
                <th>核销计划</th>
                <th>往来方 / 备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="txn in transactions" :key="txn.id">
                <td>{{ formatDate(txn.txn_date) }}</td>
                <td>
                  <span class="tag" :class="txn.direction === 'income' ? 'tag-income' : 'tag-expense'">
                    {{ directionText[txn.direction] }}
                  </span>
                </td>
                <td class="num" :class="txn.direction === 'income' ? 'money-income' : 'money-expense'">
                  {{ txn.direction === 'income' ? '+' : '-' }}{{ formatMoney(txn.amount) }}
                </td>
                <td>{{ txn.account_name }}</td>
                <td>{{ txn.category_l1 || '未分类' }}{{ txn.category_l2 ? ' / ' + txn.category_l2 : '' }}</td>
                <td>{{ txn.schedule_label || '未核销' }}</td>
                <td>{{ txn.counterparty || txn.note || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 发票 -->
      <div v-if="activeTab === 'invoices'" class="card-body tight tab-pane">
        <div class="toolbar" style="padding: 14px 18px 0">
          <button class="btn btn-sm btn-primary" type="button" @click="openInvoiceCreate">
            <NavIcon name="plus" :size="13" /> 登记发票
          </button>
          <div class="toolbar-spacer"></div>
          <span class="text-dim text-sm">P1 功能：合同内可用，一级菜单暂不开放</span>
        </div>
        <div v-if="invoices.length === 0" class="empty">
          <strong>还没有发票记录</strong>
          发票为轻量登记，不影响合同与计划
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>发票号</th>
                <th>方向</th>
                <th class="num">金额</th>
                <th class="num">税率</th>
                <th>开票日期</th>
                <th>状态</th>
                <th>备注</th>
                <th class="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invoice in invoices" :key="invoice.id">
                <td>{{ invoice.invoice_no || '—' }}</td>
                <td>{{ invoiceDirectionText[invoice.direction] }}</td>
                <td class="num">{{ formatMoney(invoice.amount) }}</td>
                <td class="num">{{ invoice.tax_rate }}%</td>
                <td>{{ formatDate(invoice.invoice_date) }}</td>
                <td><span class="tag" :class="invoice.status === 'normal' ? 'tag-green' : 'tag-amber'">{{ invoiceStatusText[invoice.status] }}</span></td>
                <td>{{ invoice.note || '—' }}</td>
                <td class="actions">
                  <button class="btn btn-link" type="button" @click="openInvoiceEdit(invoice)">编辑</button>
                  <button class="btn btn-link danger" type="button" @click="removeInvoice(invoice)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 变更 -->
      <div v-if="activeTab === 'changes'" class="card-body tight tab-pane">
        <div v-if="changes.length === 0" class="empty">
          <strong>暂无变更记录</strong>
          编辑合同的金额、日期或状态后，会自动留下变更痕迹
        </div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>字段</th>
                <th>原值</th>
                <th>新值</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="change in changes" :key="change.id">
                <td>{{ formatDateTime(change.changed_at) }}</td>
                <td>{{ change.field_name }}</td>
                <td>{{ change.old_value ?? '—' }}</td>
                <td>{{ change.new_value ?? '—' }}</td>
                <td>{{ change.reason || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 附件 -->
      <div v-if="activeTab === 'attachments'" class="card-body tab-pane">
        <label v-if="!desktop" class="file-drop" style="display: block; margin-bottom: 14px">
          <input type="file" multiple style="display: none" :disabled="uploading" @change="onFilesSelected" />
          {{ uploading ? '上传中…' : '点击选择附件（合同扫描件、补充协议、图片等）' }}
        </label>
        <button
          v-else
          class="file-drop"
          type="button"
          style="display: block; width: 100%; margin-bottom: 14px"
          :disabled="uploading"
          @click="pickAndUpload"
        >
          {{ uploading ? '上传中…' : '点击选择附件（合同扫描件、补充协议、图片等）' }}
        </button>
        <div v-if="attachments.length === 0" class="empty" style="padding: 24px">
          暂无附件，支持图片、PDF、Word 等格式
        </div>
        <div v-else class="attachment-grid">
          <div v-for="item in attachments" :key="item.path" class="attachment-card">
            <div class="attachment-thumb">
              <img v-if="item.mime.startsWith('image/') && attachmentUrls[item.path]" :src="attachmentUrls[item.path]" alt="" />
              <NavIcon v-else name="file" :size="30" />
            </div>
            <div class="attachment-meta">
              <strong :title="item.name">{{ item.name }}</strong>
              <span>{{ formatFileSize(item.size) }} · {{ attachmentTime(item.created_at) }}</span>
              <div style="display: flex; gap: 8px; margin-top: 4px">
                <button v-if="item.mime === 'application/pdf' || item.mime.startsWith('image/')" class="btn btn-link" type="button" @click="previewAttachment(item)">预览</button>
                <button class="btn btn-link" type="button" @click="openAttachment(item.path)">打开</button>
                <button class="btn btn-link danger" type="button" @click="removeAttachment(item)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 计划编辑 -->
    <ModalDialog v-model="showScheduleForm" :title="editingScheduleId ? '编辑计划' : '添加计划'" size="sm">
      <div class="form-grid" style="grid-template-columns: 1fr">
        <div class="field">
          <label>计划名称</label>
          <input v-model="scheduleForm.label" class="input" list="schedule-labels" placeholder="预付款 / 进度款 / 尾款" />
          <datalist id="schedule-labels">
            <option value="预付款"></option>
            <option value="进度款"></option>
            <option value="尾款"></option>
            <option value="质保金"></option>
          </datalist>
        </div>
        <div class="field">
          <label>到期日 <span class="req">*</span></label>
          <input v-model="scheduleForm.due_date" class="input" type="date" />
        </div>
        <div class="field">
          <label>计划金额 <span class="req">*</span></label>
          <input v-model.number="scheduleForm.planned_amount" class="input num" type="number" min="0" step="0.01" />
        </div>
      </div>
      <template #footer>
        <button class="btn" type="button" @click="showScheduleForm = false">取消</button>
        <button class="btn btn-primary" type="button" @click="submitSchedule">保存</button>
      </template>
    </ModalDialog>

    <!-- 按比例生成计划 -->
    <ModalDialog v-model="showGenerate" title="按比例生成收付款计划" size="lg">
      <p class="text-muted text-sm" style="margin-bottom: 12px">
        以合同金额 {{ formatMoney(contractAmount) }} 为基数，按比例拆分为多期计划。
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th style="width: 110px">比例(%)</th>
              <th>到期日</th>
              <th class="num">金额</th>
              <th style="width: 60px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in genRows" :key="index">
              <td><input v-model="row.label" class="input" /></td>
              <td><input v-model.number="row.percent" class="input num" type="number" min="0" max="100" step="1" /></td>
              <td><input v-model="row.due_date" class="input" type="date" /></td>
              <td class="num">{{ formatMoney(genAmount(row.percent)) }}</td>
              <td class="actions">
                <button class="btn btn-link danger" type="button" @click="removeGenRow(index)">移除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 12px">
        <button class="btn btn-sm" type="button" @click="addGenRow">+ 增加一期</button>
        <span class="text-sm" :style="{ color: Math.abs(genPercentTotal - 100) < 0.01 ? '#059669' : '#dc2626' }">
          比例合计 {{ genPercentTotal }}%
        </span>
      </div>
      <template #footer>
        <button class="btn" type="button" @click="showGenerate = false">取消</button>
        <button class="btn btn-primary" type="button" @click="submitGenerate">生成计划</button>
      </template>
    </ModalDialog>

    <!-- 发票表单 -->
    <ModalDialog v-model="showInvoiceForm" :title="editingInvoiceId ? '编辑发票' : '登记发票'" size="md">
      <div class="form-grid">
        <div class="field">
          <label>发票号</label>
          <input v-model="invoiceForm.invoice_no" class="input" placeholder="选填" />
        </div>
        <div class="field">
          <label>方向</label>
          <select v-model="invoiceForm.direction" class="select">
            <option value="issued">开票（我方开出）</option>
            <option value="received">收票（收到发票）</option>
          </select>
        </div>
        <div class="field">
          <label>金额 <span class="req">*</span></label>
          <input v-model.number="invoiceForm.amount" class="input num" type="number" min="0" step="0.01" />
        </div>
        <div class="field">
          <label>税率(%)</label>
          <input v-model.number="invoiceForm.tax_rate" class="input num" type="number" min="0" step="0.01" />
        </div>
        <div class="field">
          <label>开票日期</label>
          <input v-model="invoiceForm.invoice_date" class="input" type="date" />
        </div>
        <div class="field">
          <label>状态</label>
          <select v-model="invoiceForm.status" class="select">
            <option value="normal">正常</option>
            <option value="missing_payment">缺流水</option>
            <option value="missing_invoice">缺发票</option>
          </select>
        </div>
        <div class="field span-2">
          <label>备注</label>
          <input v-model="invoiceForm.note" class="input" />
        </div>
      </div>
      <template #footer>
        <button class="btn" type="button" @click="showInvoiceForm = false">取消</button>
        <button class="btn btn-primary" type="button" @click="submitInvoice">保存</button>
      </template>
    </ModalDialog>

    <ContractFormModal v-model="showContractForm" :contract="contract" @saved="reloadAndBadges" />
  </div>

  <div v-else class="empty">
    <strong>合同不存在或已删除</strong>
    <button class="btn btn-sm" type="button" style="margin-top: 12px" @click="back">返回合同台账</button>
  </div>
</template>
