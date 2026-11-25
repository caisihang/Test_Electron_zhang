<script setup lang="ts">
// 收支流水：记账 + 关联合同计划 + 核销（推荐匹配 + 人工确认）
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { listAccounts } from '@/db/repositories/accounts'
import { listContracts } from '@/db/repositories/contracts'
import { buildCategoryTree } from '@/db/repositories/categories'
import {
  createTransaction,
  listOpenSchedulesByContract,
  listTransactions,
  setTransactionVoucher,
  softDeleteTransaction,
  updateTransaction,
  type TransactionFilter,
} from '@/db/repositories/transactions'
import {
  cancelReconcile,
  confirmReconcile,
  findReconcileCandidates,
  recalcContractSchedules,
} from '@/db/repositories/schedules'
import type {
  AccountWithBalance,
  ContractRow,
  Direction,
  ReconcileCandidate,
  TransactionRow,
} from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import {
  attachmentName,
  deleteAttachment,
  importAttachment,
} from '@/services/attachment'
import { directionText, formatDate, formatMoney, today } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const rows = ref<TransactionRow[]>([])
const accounts = ref<AccountWithBalance[]>([])
const contracts = ref<ContractRow[]>([])
const filters = reactive<TransactionFilter>({
  keyword: '',
  direction: '',
  accountId: 0,
  contractId: 0,
  from: '',
  to: '',
})

const showForm = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  id: 0,
  account_id: 0,
  direction: 'expense' as Direction,
  amount: 0,
  txn_date: today(),
  category_l1: '',
  category_l2: '',
  contract_id: null as number | null,
  schedule_id: null as number | null,
  counterparty: '',
  note: '',
  voucher_path: '',
})

// 核销
const showReconcile = ref(false)
const reconcileTarget = ref<TransactionRow | null>(null)
const candidates = ref<ReconcileCandidate[]>([])
// 待归档的凭证文件（保存拿到流水 ID 后再写入附件目录）
const pendingVoucher = ref<File | null>(null)

const categoryTree = computed(() => buildCategoryTree(form.direction))
const categoryL2Options = computed(() => {
  const node = categoryTree.value.find((item) => item.name === form.category_l1)
  return node?.children ?? []
})
const openSchedules = computed(() =>
  form.contract_id && form.direction
    ? listOpenSchedulesByContract(form.contract_id, form.direction)
    : [],
)

function load(): void {
  rows.value = listTransactions({
    keyword: filters.keyword,
    direction: filters.direction,
    accountId: filters.accountId || undefined,
    contractId: filters.contractId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  })
}

onMounted(() => {
  accounts.value = listAccounts(false)
  contracts.value = listContracts({})
  const contractId = Number(route.query.contractId ?? 0)
  if (contractId) filters.contractId = contractId
  load()

  if (route.query.new === '1') {
    openCreate()
    if (contractId) {
      form.contract_id = contractId
      const contract = contracts.value.find((item) => item.id === contractId)
      if (contract) form.direction = contract.direction
      const scheduleId = Number(route.query.scheduleId ?? 0)
      if (scheduleId) {
        form.schedule_id = scheduleId
        const direction = route.query.direction as Direction | undefined
        if (direction) form.direction = direction
      }
    }
    // 清理 URL 上的 new 参数，避免刷新重复弹窗
    void router.replace({ path: '/transactions', query: contractId ? { contractId: String(contractId) } : {} })
  }
})

// 方向变化时分类与计划都需要重选（用显式事件，避免编辑回填时被 watch 清空）
function setDirection(direction: Direction): void {
  if (form.direction === direction) return
  form.direction = direction
  form.category_l1 = ''
  form.category_l2 = ''
  form.schedule_id = null
  const contract = contracts.value.find((item) => item.id === form.contract_id)
  if (contract && contract.direction !== direction) form.contract_id = null
}

function onContractChange(): void {
  form.schedule_id = null
}

function resetForm(): void {
  form.id = 0
  form.account_id = accounts.value[0]?.id ?? 0
  form.direction = 'expense'
  form.amount = 0
  form.txn_date = today()
  form.category_l1 = ''
  form.category_l2 = ''
  form.contract_id = null
  form.schedule_id = null
  form.counterparty = ''
  form.note = ''
  form.voucher_path = ''
  formError.value = ''
  pendingVoucher.value = null
}

function openCreate(): void {
  resetForm()
  showForm.value = true
}

function openEdit(row: TransactionRow): void {
  resetForm()
  form.id = row.id
  form.account_id = row.account_id
  form.direction = row.direction
  form.amount = row.amount
  form.txn_date = row.txn_date
  form.category_l1 = row.category_l1 ?? ''
  form.category_l2 = row.category_l2 ?? ''
  form.contract_id = row.contract_id
  form.schedule_id = row.schedule_id
  form.counterparty = row.counterparty ?? ''
  form.note = row.note ?? ''
  form.voucher_path = row.voucher_path ?? ''
  showForm.value = true
}

async function onVoucherSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // 先暂存文件，保存拿到流水 ID 后再写入 transaction/{id}/ 目录
  pendingVoucher.value = file
  input.value = ''
  store.showToast('凭证已选择')
}

async function removeVoucher(): Promise<void> {
  if (form.voucher_path) await deleteAttachment(form.voucher_path)
  form.voucher_path = ''
  pendingVoucher.value = null
}

async function submit(): Promise<void> {
  formError.value = ''
  if (!form.account_id) {
    formError.value = '请先创建并选择账户'
    return
  }
  if (Number(form.amount) <= 0) {
    formError.value = '金额需大于 0'
    return
  }
  if (!form.txn_date) {
    formError.value = '请选择日期'
    return
  }
  if (form.schedule_id && !form.contract_id) {
    formError.value = '核销计划前必须选择合同'
    return
  }

  saving.value = true
  try {
    const payload = {
      account_id: form.account_id,
      direction: form.direction,
      amount: Number(form.amount),
      txn_date: form.txn_date,
      category_l1: form.category_l1 || null,
      category_l2: form.category_l2 || null,
      contract_id: form.contract_id,
      schedule_id: form.schedule_id,
      counterparty: form.counterparty || null,
      note: form.note || null,
      voucher_path: form.voucher_path || null,
    }
    const oldVoucher = form.voucher_path
    let txnId = form.id
    if (form.id) {
      updateTransaction(form.id, payload)
    } else {
      txnId = createTransaction(payload)
    }

    // 有新增/替换的凭证文件时，按真实流水 ID 归档
    if (pendingVoucher.value && txnId) {
      if (oldVoucher) await deleteAttachment(oldVoucher)
      const path = await importAttachment(pendingVoucher.value, 'transaction', txnId)
      setTransactionVoucher(txnId, path)
      pendingVoucher.value = null
      form.voucher_path = path
    }

    if (form.contract_id) recalcContractSchedules(form.contract_id)
    showForm.value = false
    load()
    store.refreshBadges()
    store.showToast('流水已保存')
  } catch (error) {
    formError.value = String(error instanceof Error ? error.message : error)
  } finally {
    saving.value = false
  }
}

async function remove(row: TransactionRow): Promise<void> {
  const ok = await confirmAction({
    title: '删除流水',
    message: `确定删除 ${formatDate(row.txn_date)} 的 ${formatMoney(row.amount)} 元流水吗？关联计划会重新计算。`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  softDeleteTransaction(row.id)
  load()
  store.refreshBadges()
  store.showToast('流水已删除', 'info')
}

// ---------- 核销 ----------
function openReconcile(row: TransactionRow): void {
  reconcileTarget.value = row
  candidates.value = findReconcileCandidates(row.id)
  showReconcile.value = true
}

function doConfirmReconcile(scheduleId: number): void {
  if (!reconcileTarget.value) return
  confirmReconcile(reconcileTarget.value.id, scheduleId)
  if (reconcileTarget.value.contract_id) recalcContractSchedules(reconcileTarget.value.contract_id)
  showReconcile.value = false
  load()
  store.refreshBadges()
  store.showToast('核销成功')
}

async function doCancelReconcile(row: TransactionRow): Promise<void> {
  const ok = await confirmAction({
    title: '取消核销',
    message: '取消后该流水与计划的关联会解除，计划金额将重新汇总。',
    confirmText: '取消核销',
  })
  if (!ok) return
  cancelReconcile(row.id)
  if (row.contract_id) recalcContractSchedules(row.contract_id)
  load()
  store.refreshBadges()
  store.showToast('已取消核销', 'info')
}

function voucherLabel(path: string | null): string {
  return path ? attachmentName(path) : ''
}

function scheduleTagClass(status: string): string {
  if (status === 'settled') return 'tag-green'
  if (status === 'overdue') return 'tag-red'
  return 'tag-gray'
}

function clearContractFilter(): void {
  filters.contractId = 0
  void router.replace('/transactions')
  load()
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">收支流水</div>
      <div class="page-desc">一笔流水可核销一期计划；零星收支不关联合同</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-primary" type="button" @click="openCreate">
        <NavIcon name="plus" :size="14" /> 记一笔
      </button>
    </div>
  </div>

  <div v-if="filters.contractId" class="hint-box" style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px">
    当前仅显示合同「{{ contracts.find((c) => c.id === filters.contractId)?.title || filters.contractId }}」的流水
    <button class="btn btn-link" type="button" @click="clearContractFilter">清除筛选</button>
  </div>

  <div class="toolbar">
    <input v-model="filters.keyword" class="input search" placeholder="搜索往来方 / 备注 / 合同" @keyup.enter="load" />
    <select v-model="filters.direction" class="select" @change="load">
      <option value="">全部方向</option>
      <option value="income">收入</option>
      <option value="expense">支出</option>
    </select>
    <select v-model.number="filters.accountId" class="select" @change="load">
      <option :value="0">全部账户</option>
      <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
    </select>
    <input v-model="filters.from" class="input" type="date" title="开始日期" @change="load" />
    <span class="text-dim">至</span>
    <input v-model="filters.to" class="input" type="date" title="结束日期" @change="load" />
    <button class="btn" type="button" @click="load"><NavIcon name="search" :size="14" /> 查询</button>
    <div class="toolbar-spacer"></div>
    <span class="text-dim text-sm">共 {{ rows.length }} 笔</span>
  </div>

  <div class="card">
    <div class="card-body tight">
      <div v-if="rows.length === 0" class="empty">
        <strong>还没有流水记录</strong>
        点击右上角「记一笔」记录第一笔真实收付
      </div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>方向 / 金额</th>
              <th>账户</th>
              <th>分类</th>
              <th>合同 / 计划</th>
              <th>往来方 / 备注</th>
              <th>凭证</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ formatDate(row.txn_date) }}</td>
              <td>
                <span class="tag" :class="row.direction === 'income' ? 'tag-income' : 'tag-expense'">
                  {{ directionText[row.direction] }}
                </span>
                <span
                  class="num"
                  :class="row.direction === 'income' ? 'money-income' : 'money-expense'"
                  style="margin-left: 8px; font-weight: 600"
                >
                  {{ formatMoney(row.amount) }}
                </span>
              </td>
              <td>{{ row.account_name }}</td>
              <td>{{ row.category_l1 || '未分类' }}<span v-if="row.category_l2" class="text-dim"> / {{ row.category_l2 }}</span></td>
              <td>
                <template v-if="row.contract_title">
                  <span class="link-like" @click="router.push(`/contracts/${row.contract_id}`)">{{ row.contract_title }}</span>
                  <div class="cell-sub">
                    <span v-if="row.schedule_id" class="tag tag-blue">{{ row.schedule_label || '已核销' }}</span>
                    <span v-else>未核销</span>
                  </div>
                </template>
                <span v-else class="text-dim">零星收支</span>
              </td>
              <td>
                {{ row.counterparty || '—' }}
                <div v-if="row.note" class="cell-sub">{{ row.note }}</div>
              </td>
              <td>
                <span v-if="row.voucher_path" class="tag tag-green" :title="voucherLabel(row.voucher_path)">
                  <NavIcon name="paperclip" :size="11" /> 有
                </span>
                <span v-else class="text-dim">—</span>
              </td>
              <td class="actions">
                <button
                  v-if="row.contract_id && !row.schedule_id"
                  class="btn btn-link"
                  type="button"
                  @click="openReconcile(row)"
                >核销</button>
                <button
                  v-if="row.schedule_id"
                  class="btn btn-link"
                  type="button"
                  @click="doCancelReconcile(row)"
                >取消核销</button>
                <button class="btn btn-link" type="button" @click="openEdit(row)">编辑</button>
                <button class="btn btn-link danger" type="button" @click="remove(row)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- 流水表单 -->
  <ModalDialog v-model="showForm" :title="form.id ? '编辑流水' : '记一笔'" size="lg">
    <div class="form-grid">
      <div class="field">
        <label>方向</label>
        <div class="seg" style="width: fit-content">
          <button type="button" :class="{ active: form.direction === 'expense' }" @click="setDirection('expense')">支出</button>
          <button type="button" :class="{ active: form.direction === 'income' }" @click="setDirection('income')">收入</button>
        </div>
      </div>
      <div class="field">
        <label>金额 <span class="req">*</span></label>
        <input v-model.number="form.amount" class="input num" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="field">
        <label>账户 <span class="req">*</span></label>
        <select v-model.number="form.account_id" class="select">
          <option :value="0" disabled>请选择账户</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>日期 <span class="req">*</span></label>
        <input v-model="form.txn_date" class="input" type="date" />
      </div>
      <div class="field">
        <label>一级分类</label>
        <select v-model="form.category_l1" class="select" @change="form.category_l2 = ''">
          <option value="">未分类</option>
          <option v-for="node in categoryTree" :key="node.id" :value="node.name">{{ node.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>二级分类</label>
        <select v-model="form.category_l2" class="select" :disabled="categoryL2Options.length === 0">
          <option value="">未分类</option>
          <option v-for="node in categoryL2Options" :key="node.id" :value="node.name">{{ node.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>关联合同</label>
        <select v-model.number="form.contract_id" class="select" @change="onContractChange">
          <option :value="null">零星收支（不关联）</option>
          <option v-for="contract in contracts" :key="contract.id" :value="contract.id">
            {{ contract.contract_no }} · {{ contract.title }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>核销计划</label>
        <select v-model.number="form.schedule_id" class="select" :disabled="!form.contract_id || openSchedules.length === 0">
          <option :value="null">暂不核销</option>
          <option v-for="schedule in openSchedules" :key="schedule.id" :value="schedule.id">
            {{ schedule.label || '计划' }} · 到期 {{ formatDate(schedule.due_date) }} · 剩余 {{ formatMoney(schedule.remaining) }}
          </option>
        </select>
        <span class="field-hint">
          {{ form.contract_id ? (openSchedules.length === 0 ? '该合同没有未结清计划' : '可选择一期计划进行核销') : '选择合同后可核销计划' }}
        </span>
      </div>
      <div class="field">
        <label>往来方</label>
        <input v-model="form.counterparty" class="input" placeholder="收款方 / 付款方" />
      </div>
      <div class="field">
        <label>凭证附件</label>
        <div v-if="pendingVoucher || form.voucher_path" style="display: flex; align-items: center; gap: 8px">
          <span class="tag tag-green">
            <NavIcon name="paperclip" :size="11" />
            {{ pendingVoucher ? pendingVoucher.name : attachmentName(form.voucher_path) }}
          </span>
          <button class="btn btn-link danger" type="button" @click="removeVoucher">移除</button>
        </div>
        <label v-else class="file-drop" style="padding: 7px">
          点击选择凭证文件
          <input type="file" style="display: none" @change="onVoucherSelected" />
        </label>
      </div>
      <div class="field span-2">
        <label>备注</label>
        <textarea v-model="form.note" class="textarea" placeholder="用途、单号等"></textarea>
      </div>
    </div>
    <p v-if="formError" style="color: #dc2626; font-size: 12.5px; margin-top: 12px">{{ formError }}</p>
    <template #footer>
      <button class="btn" type="button" @click="showForm = false">取消</button>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">保存</button>
    </template>
  </ModalDialog>

  <!-- 核销推荐 -->
  <ModalDialog v-model="showReconcile" title="核销计划" size="md">
    <p class="text-muted text-sm" style="margin-bottom: 12px">
      按金额接近程度排序，最终以人工确认为准。仅显示同合同、同方向、未结清的计划。
    </p>
    <div v-if="candidates.length === 0" class="empty" style="padding: 20px">
      <strong>没有可核销的计划</strong>
      该合同下没有未结清计划，或流水方向不一致
    </div>
    <div v-else class="card" style="box-shadow: none">
      <div v-for="item in candidates" :key="item.schedule_id" class="list-row">
        <div class="list-main">
          <div class="list-title">{{ item.label || '计划' }} · 到期 {{ formatDate(item.due_date) }}</div>
          <div class="list-sub">
            计划 {{ formatMoney(item.planned_amount) }} · 已收付 {{ formatMoney(item.actual_amount) }} · 剩余
            {{ formatMoney(item.remaining) }}
          </div>
        </div>
        <span class="tag tag-blue">匹配度 {{ Math.round(item.score * 100) }}%</span>
        <button class="btn btn-sm btn-primary" type="button" @click="doConfirmReconcile(item.schedule_id)">核销</button>
      </div>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="showReconcile = false">关闭</button>
    </template>
  </ModalDialog>
</template>
