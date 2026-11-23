<script setup lang="ts">
// 合同执行表：合同金额 vs 计划合计 vs 实际收付
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listContractExecution, listYears, type ContractExecutionRow } from '@/db/repositories/analysis'
import { directionText, formatMoney, ratio } from '@/utils/format'

const router = useRouter()
const years = ref<string[]>([])
const year = ref('')
const rows = ref<ContractExecutionRow[]>([])

const totals = computed(() => {
  const totalAmount = rows.value.reduce((sum, row) => sum + Number(row.total_amount), 0)
  const actual = rows.value.reduce((sum, row) => sum + Number(row.actual_total), 0)
  const planned = rows.value.reduce((sum, row) => sum + Number(row.planned_total), 0)
  return { totalAmount, actual, planned, rate: ratio(actual, totalAmount) }
})

function load(): void {
  rows.value = listContractExecution(year.value)
}

onMounted(() => {
  years.value = listYears()
  year.value = ''
  load()
})

watch(year, load)

function rateOf(row: ContractExecutionRow): number {
  return ratio(Number(row.actual_total), Number(row.total_amount))
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">合同执行表</div>
      <div class="page-desc">执行率 = 实际收付金额 / 合同金额；计划合计用于核对分期是否拆全</div>
    </div>
    <div class="page-actions">
      <select v-model="year" class="select" style="width: 140px">
        <option value="">全部年份</option>
        <option v-for="item in years" :key="item" :value="item">{{ item }} 年</option>
      </select>
    </div>
  </div>

  <div class="stat-grid cols-3" style="margin-bottom: 16px">
    <div class="stat-card">
      <div class="stat-label">合同总额</div>
      <div class="stat-value">{{ formatMoney(totals.totalAmount) }}</div>
      <div class="stat-hint">{{ rows.length }} 份合同</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">实际收付</div>
      <div class="stat-value primary">{{ formatMoney(totals.actual) }}</div>
      <div class="stat-hint">整体执行率 {{ (totals.rate * 100).toFixed(1) }}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">计划合计</div>
      <div class="stat-value">{{ formatMoney(totals.planned) }}</div>
      <div class="stat-hint" :style="{ color: Math.abs(totals.planned - totals.totalAmount) > 0.01 ? '#b45309' : undefined }">
        {{ Math.abs(totals.planned - totals.totalAmount) > 0.01 ? '与合同总额存在差额，请检查分期' : '与合同总额一致' }}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-body tight">
      <div v-if="rows.length === 0" class="empty">
        <strong>暂无合同数据</strong>
        新建合同并生成收付款计划后，这里会自动汇总
      </div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>合同</th>
              <th>方向</th>
              <th>年份</th>
              <th class="num">合同金额</th>
              <th class="num">计划合计</th>
              <th class="num">实际收付</th>
              <th>计划完成</th>
              <th style="width: 190px">执行率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <div class="cell-main">
                  <span class="link-like" @click="router.push(`/contracts/${row.id}`)">{{ row.title }}</span>
                </div>
                <div class="cell-sub">{{ row.contract_no }} · {{ row.counterparty }}</div>
              </td>
              <td>
                <span class="tag" :class="row.direction === 'income' ? 'tag-income' : 'tag-expense'">
                  {{ directionText[row.direction] }}
                </span>
              </td>
              <td>{{ row.year }}</td>
              <td class="num">{{ formatMoney(row.total_amount) }}</td>
              <td class="num">{{ formatMoney(row.planned_total) }}</td>
              <td class="num" :class="row.direction === 'income' ? 'money-income' : 'money-expense'">
                {{ formatMoney(row.actual_total) }}
              </td>
              <td>
                <span class="tag" :class="row.open_count > 0 ? 'tag-amber' : 'tag-green'">
                  {{ row.settled_count }} / {{ row.schedule_count }}
                </span>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px">
                  <div class="progress" style="flex: 1">
                    <div class="progress-bar" :style="{ width: Math.min(rateOf(row) * 100, 100) + '%' }"></div>
                  </div>
                  <span class="text-sm" style="width: 46px; text-align: right">{{ (rateOf(row) * 100).toFixed(1) }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
