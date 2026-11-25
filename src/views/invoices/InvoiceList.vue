<script setup lang="ts">
// 发票管理：已开/未开、普票/专票，按合同核对开票进度
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { listContracts } from '@/db/repositories/contracts'
import {
  createInvoice,
  deleteInvoice,
  getInvoiceSummary,
  listInvoices,
  updateInvoice,
  type InvoiceFilter,
  type InvoiceInput,
} from '@/db/repositories/invoices'
import type {
  ContractRow,
  InvoiceDirection,
  InvoiceIssueStatus,
  InvoiceRow,
  InvoiceType,
} from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import { exportInvoicesXlsx } from '@/services/exporter'
import {
  formatDate,
  formatMoney,
  invoiceDirectionText,
  invoiceTypeText,
  issueStatusText,
  today,
} from '@/utils/format'

const router = useRouter()
const store = useAppStore()

const rows = ref<InvoiceRow[]>([])
const contracts = ref<ContractRow[]>([])
const filters = reactive<InvoiceFilter>({
  keyword: '',
  direction: '',
  issueStatus: '',
  invoiceType: '',
  contractId: 0,
})

// 汇总：已开/未开金额、待开票合同数
const summary = computed(() => getInvoiceSummary())

const showForm = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  invoice_no: '',
  direction: 'issued' as InvoiceDirection,
  amount: 0,
  tax_rate: 0,
  invoice_date: today(),
  contract_id: null as number | null,
  invoice_type: 'ordinary' as InvoiceType,
  issue_status: 'issued' as InvoiceIssueStatus,
  note: '',
})

function load(): void {
  rows.value = listInvoices({
    keyword: filters.keyword,
    direction: filters.direction,
    issueStatus: filters.issueStatus,
    invoiceType: filters.invoiceType,
    contractId: filters.contractId || undefined,
  })
}

onMounted(() => {
  contracts.value = listContracts({})
  load()
})

function resetForm(): void {
  editingId.value = null
  form.invoice_no = ''
  form.direction = 'issued'
  form.amount = 0
  form.tax_rate = 0
  form.invoice_date = today()
  form.contract_id = null
  form.invoice_type = 'ordinary'
  form.issue_status = 'issued'
  form.note = ''
  formError.value = ''
}

function openCreate(): void {
  resetForm()
  showForm.value = true
}

function openEdit(row: InvoiceRow): void {
  resetForm()
  editingId.value = row.id
  form.invoice_no = row.invoice_no ?? ''
  form.direction = row.direction
  form.amount = row.amount
  form.tax_rate = row.tax_rate
  form.invoice_date = row.invoice_date ?? ''
  form.contract_id = row.contract_id
  form.invoice_type = row.invoice_type
  form.issue_status = row.issue_status
  form.note = row.note ?? ''
  showForm.value = true
}

// 选择合同时，按合同方向自动切换开票/收票
function onContractChange(): void {
  const contract = contracts.value.find((item) => item.id === form.contract_id)
  if (!contract) return
  form.direction = contract.direction === 'expense' ? 'received' : 'issued'
}

function submit(): void {
  formError.value = ''
  if (Number(form.amount) <= 0) {
    formError.value = '金额需大于 0'
    return
  }
  if (form.issue_status === 'issued' && !form.invoice_date) {
    formError.value = '已开票请填写开票日期'
    return
  }
  saving.value = true
  try {
    const payload: InvoiceInput = {
      invoice_no: form.invoice_no || null,
      direction: form.direction,
      amount: Number(form.amount),
      tax_rate: Number(form.tax_rate) || 0,
      invoice_date: form.invoice_date || null,
      contract_id: form.contract_id,
      transaction_id: null,
      invoice_type: form.invoice_type,
      issue_status: form.issue_status,
      attachment_path: null,
      note: form.note || null,
    }
    if (editingId.value) updateInvoice(editingId.value, payload)
    else createInvoice(payload)
    showForm.value = false
    load()
    store.showToast('发票已保存')
  } catch (error) {
    formError.value = String(error instanceof Error ? error.message : error)
  } finally {
    saving.value = false
  }
}

async function remove(row: InvoiceRow): Promise<void> {
  const ok = await confirmAction({
    title: '删除发票',
    message: `确定删除发票「${row.invoice_no || '未填发票号'}」吗？`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  deleteInvoice(row.id)
  load()
  store.showToast('发票已删除', 'info')
}

// 导出当前筛选结果
async function exportExcel(): Promise<void> {
  try {
    const path = await exportInvoicesXlsx()
    if (path !== null) store.showToast('发票台账已保存')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

function openContract(id: number | null): void {
  if (id) void router.push(`/contracts/${id}`)
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">发票管理</div>
      <div class="page-desc">按合同核对开票进度：已开票金额、未开票余额、普票与专票</div>
    </div>
    <div class="page-actions">
      <button class="btn" type="button" @click="exportExcel">导出 Excel</button>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <NavIcon name="plus" :size="14" /> 登记发票
      </button>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-label">已开票金额</div>
      <div class="stat-value money-income">{{ formatMoney(summary.issuedAmount) }}</div>
      <div class="stat-hint">{{ summary.issuedCount }} 张已开</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">未开票金额</div>
      <div class="stat-value">{{ formatMoney(summary.notIssuedAmount) }}</div>
      <div class="stat-hint">{{ summary.notIssuedCount }} 张待开</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">待开票合同</div>
      <div class="stat-value">{{ summary.pendingContractCount }}</div>
      <div class="stat-hint">合同金额尚未开满</div>
    </div>
  </div>

  <div class="toolbar">
    <input v-model="filters.keyword" class="input search" placeholder="搜索发票号 / 备注 / 合同" @keyup.enter="load" />
    <select v-model="filters.issueStatus" class="select" @change="load">
      <option value="">全部开票状态</option>
      <option value="issued">已开</option>
      <option value="not_issued">未开</option>
    </select>
    <select v-model="filters.invoiceType" class="select" @change="load">
      <option value="">全部票种</option>
      <option value="ordinary">普票</option>
      <option value="special">专票</option>
    </select>
    <select v-model="filters.direction" class="select" @change="load">
      <option value="">全部方向</option>
      <option value="issued">开出</option>
      <option value="received">收到</option>
    </select>
    <select v-model="filters.contractId" class="select" @change="load">
      <option :value="0">全部合同</option>
      <option v-for="contract in contracts" :key="contract.id" :value="contract.id">
        {{ contract.contract_no }} {{ contract.title }}
      </option>
    </select>
    <button class="btn" type="button" @click="load">查询</button>
  </div>

  <div class="card">
    <div v-if="rows.length === 0" class="empty">
      <strong>暂无发票记录</strong>
      登记发票后，可对照合同金额查看已开票与未开票余额
    </div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>发票号</th>
            <th>类型</th>
            <th>开票状态</th>
            <th>方向</th>
            <th class="num">金额</th>
            <th class="num">税率</th>
            <th>开票日期</th>
            <th>关联合同</th>
            <th>备注</th>
            <th class="actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.invoice_no || '—' }}</td>
            <td>
              <span class="tag" :class="row.invoice_type === 'special' ? 'tag-blue' : 'tag-gray'">
                {{ invoiceTypeText[row.invoice_type] }}
              </span>
            </td>
            <td>
              <span class="tag" :class="row.issue_status === 'issued' ? 'tag-green' : 'tag-amber'">
                {{ issueStatusText[row.issue_status] }}
              </span>
            </td>
            <td>{{ invoiceDirectionText[row.direction] }}</td>
            <td class="num">{{ formatMoney(row.amount) }}</td>
            <td class="num">{{ row.tax_rate }}%</td>
            <td>{{ formatDate(row.invoice_date) }}</td>
            <td>
              <button v-if="row.contract_id" class="btn btn-link" type="button" @click="openContract(row.contract_id)">
                {{ row.contract_no }}
              </button>
              <span v-else class="text-dim">未关联</span>
            </td>
            <td>{{ row.note || '—' }}</td>
            <td class="actions">
              <button class="btn btn-link" type="button" @click="openEdit(row)">编辑</button>
              <button class="btn btn-link danger" type="button" @click="remove(row)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 发票表单 -->
  <ModalDialog v-model="showForm" :title="editingId ? '编辑发票' : '登记发票'" size="md">
    <div class="form-grid">
      <div class="field">
        <label>发票号</label>
        <input v-model="form.invoice_no" class="input" placeholder="选填" />
      </div>
      <div class="field">
        <label>关联合同</label>
        <select v-model="form.contract_id" class="select" @change="onContractChange">
          <option :value="null">不关联（零星票据）</option>
          <option v-for="contract in contracts" :key="contract.id" :value="contract.id">
            {{ contract.contract_no }} {{ contract.title }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>发票类型</label>
        <select v-model="form.invoice_type" class="select">
          <option value="ordinary">普通发票</option>
          <option value="special">增值税专用发票</option>
        </select>
      </div>
      <div class="field">
        <label>开票状态</label>
        <select v-model="form.issue_status" class="select">
          <option value="not_issued">未开</option>
          <option value="issued">已开</option>
        </select>
      </div>
      <div class="field">
        <label>方向</label>
        <select v-model="form.direction" class="select">
          <option value="issued">开票（我方开出）</option>
          <option value="received">收票（收到发票）</option>
        </select>
      </div>
      <div class="field">
        <label>金额 <span class="req">*</span></label>
        <input v-model.number="form.amount" class="input num" type="number" min="0" step="0.01" />
      </div>
      <div class="field">
        <label>税率(%)</label>
        <input v-model.number="form.tax_rate" class="input num" type="number" min="0" step="0.01" />
      </div>
      <div class="field">
        <label>开票日期</label>
        <input v-model="form.invoice_date" class="input" type="date" />
        <span class="text-dim text-sm">未开票可留空</span>
      </div>
      <div class="field span-2">
        <label>备注</label>
        <input v-model="form.note" class="input" />
      </div>
    </div>
    <p v-if="formError" class="form-error">{{ formError }}</p>
    <template #footer>
      <button class="btn" type="button" @click="showForm = false">取消</button>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
