<script setup lang="ts">
// 合同台账：关键词 / 方向 / 状态筛选，软删除进回收站
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import ContractFormModal from '@/components/ContractFormModal.vue'
import { listContracts, softDeleteContract, type ContractFilter } from '@/db/repositories/contracts'
import type { Contract, ContractRow } from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import { contractStatusText, directionText, formatDate, formatMoney } from '@/utils/format'

const router = useRouter()
const store = useAppStore()

const rows = ref<ContractRow[]>([])
const filters = reactive<ContractFilter>({ keyword: '', direction: '', status: '' })
const showForm = ref(false)
const editing = ref<Contract | null>(null)

function load(): void {
  rows.value = listContracts(filters)
}

onMounted(load)

function getStatusTag(status: string): string {
  if (status === 'active') return 'tag-blue'
  if (status === 'completed') return 'tag-green'
  if (status === 'terminated') return 'tag-red'
  return 'tag-gray'
}

function openCreate(): void {
  editing.value = null
  showForm.value = true
}

function openEdit(contract: ContractRow): void {
  editing.value = contract
  showForm.value = true
}

function onSaved(): void {
  load()
  store.refreshBadges()
  store.showToast('合同已保存')
}

async function remove(contract: ContractRow): Promise<void> {
  const ok = await confirmAction({
    title: '删除合同',
    message: `确定把「${contract.title}」移入回收站吗？关联计划与流水会保留，可在后续版本恢复。`,
    confirmText: '移入回收站',
    danger: true,
  })
  if (!ok) return
  softDeleteContract(contract.id)
  load()
  store.refreshBadges()
  store.showToast('已移入回收站', 'info')
}

function goDetail(id: number): void {
  router.push(`/contracts/${id}`)
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">合同台账</div>
      <div class="page-desc">合同是业务源头，计划、流水、发票都在详情页里</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-primary" type="button" @click="openCreate">
        <NavIcon name="plus" :size="14" /> 新建合同
      </button>
    </div>
  </div>

  <div class="toolbar">
    <input
      v-model="filters.keyword"
      class="input search"
      placeholder="搜索合同名称 / 编号 / 对方单位"
      @keyup.enter="load"
    />
    <select v-model="filters.direction" class="select" @change="load">
      <option value="">全部方向</option>
      <option value="income">收入合同</option>
      <option value="expense">支出合同</option>
    </select>
    <select v-model="filters.status" class="select" @change="load">
      <option value="">全部状态</option>
      <option value="draft">草稿</option>
      <option value="active">执行中</option>
      <option value="completed">已完成</option>
      <option value="terminated">已终止</option>
    </select>
    <button class="btn" type="button" @click="load">
      <NavIcon name="search" :size="14" /> 查询
    </button>
    <div class="toolbar-spacer"></div>
    <span class="text-dim text-sm">共 {{ rows.length }} 份合同</span>
  </div>

  <div class="card">
    <div class="card-body tight">
      <div v-if="rows.length === 0" class="empty">
        <strong>还没有符合条件的合同</strong>
        先新建一份合同，再生成收付款计划
      </div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>合同</th>
              <th>方向</th>
              <th class="num">合同金额</th>
              <th class="num">已收 / 已付</th>
              <th>未结清计划</th>
              <th>结束日期</th>
              <th>状态</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <div class="cell-main">
                  <span class="link-like" @click="goDetail(row.id)">{{ row.title }}</span>
                </div>
                <div class="cell-sub">{{ row.contract_no }} · {{ row.counterparty }}</div>
              </td>
              <td>
                <span class="tag" :class="row.direction === 'income' ? 'tag-income' : 'tag-expense'">
                  {{ directionText[row.direction] }}
                </span>
              </td>
              <td class="num">{{ formatMoney(row.total_amount) }}</td>
              <td class="num">
                <span :class="row.direction === 'income' ? 'money-income' : 'money-expense'">
                  {{ formatMoney(row.direction === 'income' ? row.income_total : row.expense_total) }}
                </span>
              </td>
              <td>
                <span v-if="row.open_schedule_count > 0" class="tag tag-amber">{{ row.open_schedule_count }} 期待办</span>
                <span v-else class="tag tag-gray">无</span>
              </td>
              <td>{{ formatDate(row.end_date) }}</td>
              <td>
                <span class="tag" :class="getStatusTag(row.status)">{{ contractStatusText[row.status] }}</span>
              </td>
              <td class="actions">
                <button class="btn btn-link" type="button" @click="goDetail(row.id)">详情</button>
                <button class="btn btn-link" type="button" @click="openEdit(row)">编辑</button>
                <button class="btn btn-link danger" type="button" @click="remove(row)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ContractFormModal v-model="showForm" :contract="editing" @saved="onSaved" />
</template>
