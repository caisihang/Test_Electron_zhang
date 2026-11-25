<script setup lang="ts">
// 收付款计划：一级入口，只看待收待付
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { listContracts } from '@/db/repositories/contracts'
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
  type ScheduleFilter,
} from '@/db/repositories/schedules'
import type { ContractRow, ScheduleRow } from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import {
  directionText,
  formatDate,
  formatMoney,
  scheduleStatusText,
  today,
} from '@/utils/format'

const router = useRouter()
const store = useAppStore()

const rows = ref<ScheduleRow[]>([])
const contracts = ref<ContractRow[]>([])
const filters = reactive<ScheduleFilter>({ keyword: '', direction: '', status: 'open', from: '', to: '' })
const showForm = ref(false)
const saving = ref(false)

const form = reactive({
  id: 0,
  contract_id: 0,
  label: '进度款',
  due_date: today(),
  planned_amount: 0,
})

const totals = computed(() => {
  const open = rows.value.filter((row) => row.status !== 'settled')
  const receivable = open
    .filter((row) => row.direction === 'income')
    .reduce((sum, row) => sum + Math.max(row.planned_amount - row.actual_amount, 0), 0)
  const payable = open
    .filter((row) => row.direction === 'expense')
    .reduce((sum, row) => sum + Math.max(row.planned_amount - row.actual_amount, 0), 0)
  const overdue = open.filter((row) => row.due_date && row.due_date < today()).length
  return { receivable, payable, overdue }
})

function load(): void {
  rows.value = listSchedules({
    keyword: filters.keyword,
    direction: filters.direction,
    status: filters.status,
    from: filters.from || undefined,
    to: filters.to || undefined,
  })
}

onMounted(() => {
  contracts.value = listContracts({})
  load()
})

function setStatus(status: ScheduleFilter['status']): void {
  filters.status = status
  load()
}

function scheduleTagClass(status: string): string {
  if (status === 'settled') return 'tag-green'
  if (status === 'overdue') return 'tag-red'
  if (status === 'partial') return 'tag-amber'
  return 'tag-gray'
}

function openCreate(): void {
  const first = contracts.value.find((item) => item.deleted_at === null)
  form.id = 0
  form.contract_id = first?.id ?? 0
  form.label = '进度款'
  form.due_date = first?.end_date || today()
  form.planned_amount = 0
  showForm.value = true
}

function openEdit(row: ScheduleRow): void {
  form.id = row.id
  form.contract_id = row.contract_id
  form.label = row.label ?? ''
  form.due_date = row.due_date ?? ''
  form.planned_amount = row.planned_amount
  showForm.value = true
}

function submit(): void {
  if (!form.id && !form.contract_id) {
    store.showToast('请选择合同', 'error')
    return
  }
  if (Number(form.planned_amount) <= 0) {
    store.showToast('计划金额需大于 0', 'error')
    return
  }
  saving.value = true
  try {
    if (form.id) {
      const current = rows.value.find((row) => row.id === form.id)
      updateSchedule(form.id, {
        label: form.label || null,
        due_date: form.due_date || null,
        planned_amount: Number(form.planned_amount),
        sort_order: current?.sort_order ?? 0,
      })
    } else {
      createSchedule({
        contract_id: form.contract_id,
        label: form.label || null,
        due_date: form.due_date || null,
        planned_amount: Number(form.planned_amount),
      })
    }
    showForm.value = false
    load()
    store.refreshBadges()
    store.showToast('计划已保存')
  } finally {
    saving.value = false
  }
}

async function remove(row: ScheduleRow): Promise<void> {
  const ok = await confirmAction({
    title: '删除计划',
    message: `确定删除「${row.contract_title} · ${row.label || '计划'}」吗？`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  try {
    deleteSchedule(row.id)
    load()
    store.refreshBadges()
    store.showToast('计划已删除')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

// 去记一笔：带上合同与计划
function goTransaction(row: ScheduleRow): void {
  router.push({
    path: '/transactions',
    query: {
      new: '1',
      contractId: String(row.contract_id),
      scheduleId: String(row.id),
      direction: row.direction,
    },
  })
}

function goContract(row: ScheduleRow): void {
  router.push(`/contracts/${row.contract_id}`)
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">收付款计划</div>
      <div class="page-desc">按到期日排序；逾期与临期优先处理</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-primary" type="button" @click="openCreate">
        <NavIcon name="plus" :size="14" /> 新增计划
      </button>
    </div>
  </div>

  <div class="stat-grid cols-3" style="margin-bottom: 16px">
    <div class="stat-card">
      <div class="stat-label">待收款</div>
      <div class="stat-value green">{{ formatMoney(totals.receivable) }}</div>
      <div class="stat-hint">未结清收入计划剩余</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">待付款</div>
      <div class="stat-value red">{{ formatMoney(totals.payable) }}</div>
      <div class="stat-hint">未结清支出计划剩余</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">逾期计划</div>
      <div class="stat-value primary">{{ totals.overdue }}</div>
      <div class="stat-hint">当前筛选范围内</div>
    </div>
  </div>

  <div class="toolbar">
    <div class="seg">
      <button type="button" :class="{ active: filters.status === 'open' }" @click="setStatus('open')">未结清</button>
      <button type="button" :class="{ active: filters.status === 'overdue' }" @click="setStatus('overdue')">已逾期</button>
      <button type="button" :class="{ active: filters.status === 'settled' }" @click="setStatus('settled')">已结清</button>
      <button type="button" :class="{ active: filters.status === 'all' }" @click="setStatus('all')">全部</button>
    </div>
    <select v-model="filters.direction" class="select" @change="load">
      <option value="">全部方向</option>
      <option value="income">待收</option>
      <option value="expense">待付</option>
    </select>
    <input v-model="filters.keyword" class="input search" placeholder="搜索合同 / 对方 / 计划名" @keyup.enter="load" />
    <input v-model="filters.from" class="input" type="date" title="到期日从" @change="load" />
    <span class="text-dim">至</span>
    <input v-model="filters.to" class="input" type="date" title="到期日到" @change="load" />
    <button class="btn" type="button" @click="load"><NavIcon name="search" :size="14" /> 查询</button>
  </div>

  <div class="card">
    <div class="card-body tight">
      <div v-if="rows.length === 0" class="empty">
        <strong>没有符合条件的计划</strong>
        在合同详情里生成计划，或点击右上角新增计划
      </div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>到期日</th>
              <th>合同</th>
              <th>计划</th>
              <th>方向</th>
              <th class="num">计划金额</th>
              <th class="num">已收付</th>
              <th class="num">剩余</th>
              <th>状态</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                {{ formatDate(row.due_date) }}
                <div v-if="row.status === 'overdue'" class="cell-sub" style="color: #dc2626">已逾期</div>
              </td>
              <td>
                <span class="link-like" @click="goContract(row)">{{ row.contract_title }}</span>
                <div class="cell-sub">{{ row.counterparty }}</div>
              </td>
              <td>{{ row.label || '—' }}</td>
              <td>
                <span class="tag" :class="row.direction === 'income' ? 'tag-income' : 'tag-expense'">
                  {{ directionText[row.direction] }}
                </span>
              </td>
              <td class="num">{{ formatMoney(row.planned_amount) }}</td>
              <td class="num">{{ formatMoney(row.actual_amount) }}</td>
              <td class="num">{{ formatMoney(Math.max(row.planned_amount - row.actual_amount, 0)) }}</td>
              <td><span class="tag" :class="scheduleTagClass(row.status)">{{ scheduleStatusText[row.status] }}</span></td>
              <td class="actions">
                <button v-if="row.status !== 'settled'" class="btn btn-link" type="button" @click="goTransaction(row)">记一笔</button>
                <button class="btn btn-link" type="button" @click="openEdit(row)">编辑</button>
                <button class="btn btn-link danger" type="button" @click="remove(row)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ModalDialog v-model="showForm" :title="form.id ? '编辑计划' : '新增计划'" size="sm">
    <div class="form-grid" style="grid-template-columns: 1fr">
      <div class="field">
        <label>关联合同 <span class="req">*</span></label>
        <select v-model.number="form.contract_id" class="select" :disabled="Boolean(form.id)">
          <option :value="0" disabled>请选择合同</option>
          <option v-for="item in contracts" :key="item.id" :value="item.id">
            {{ item.contract_no }} · {{ item.title }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>计划名称</label>
        <input v-model="form.label" class="input" list="plan-labels" placeholder="预付款 / 进度款 / 尾款" />
        <datalist id="plan-labels">
          <option value="预付款"></option>
          <option value="进度款"></option>
          <option value="尾款"></option>
          <option value="质保金"></option>
        </datalist>
      </div>
      <div class="field">
        <label>到期日</label>
        <input v-model="form.due_date" class="input" type="date" />
        <span class="text-dim text-sm">可留空，留空不参与逾期判定</span>
      </div>
      <div class="field">
        <label>计划金额 <span class="req">*</span></label>
        <input v-model.number="form.planned_amount" class="input num" type="number" min="0" step="0.01" />
      </div>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="showForm = false">取消</button>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
