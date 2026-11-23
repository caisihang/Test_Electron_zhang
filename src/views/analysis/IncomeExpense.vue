<script setup lang="ts">
// 收支结余表：按月汇总 + 分类占比
import { computed, onMounted, ref, watch } from 'vue'
import {
  getCategorySummary,
  getMonthlySummary,
  listYears,
  type CategoryTotal,
  type MonthlyRow,
} from '@/db/repositories/analysis'
import { currentMonth, formatMoney, formatPercent } from '@/utils/format'

const years = ref<string[]>([])
const year = ref(new Date().getFullYear().toString())
const months = ref<MonthlyRow[]>([])
const total = ref<MonthlyRow>({ month: 0, income: 0, expense: 0, net: 0 })
const expenseCategories = ref<CategoryTotal[]>([])
const incomeCategories = ref<CategoryTotal[]>([])

const maxValue = computed(() => {
  const values = months.value.flatMap((row) => [row.income, row.expense])
  return Math.max(...values, 1)
})

const activeMonth = currentMonth().slice(0, 4) === year.value ? Number(currentMonth().slice(5, 7)) : 0

function load(): void {
  const summary = getMonthlySummary(year.value)
  months.value = summary.rows
  total.value = summary.total
  expenseCategories.value = getCategorySummary(`${year.value}-01-01`, `${year.value}-12-31`, 'expense').slice(0, 8)
  incomeCategories.value = getCategorySummary(`${year.value}-01-01`, `${year.value}-12-31`, 'income').slice(0, 8)
}

onMounted(() => {
  years.value = listYears()
  if (!years.value.includes(year.value)) year.value = years.value[0]
  load()
})

watch(year, load)

function barHeight(value: number): string {
  return `${Math.max((value / maxValue.value) * 100, 0.6)}%`
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">收支结余表</div>
      <div class="page-desc">仅统计真实流水，不含未执行的收付款计划</div>
    </div>
    <div class="page-actions">
      <select v-model="year" class="select" style="width: 130px">
        <option v-for="item in years" :key="item" :value="item">{{ item }} 年</option>
      </select>
    </div>
  </div>

  <div class="stat-grid cols-3" style="margin-bottom: 16px">
    <div class="stat-card">
      <div class="stat-label">全年收入</div>
      <div class="stat-value green">{{ formatMoney(total.income) }}</div>
      <div class="stat-hint">{{ year }} 年累计</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">全年支出</div>
      <div class="stat-value red">{{ formatMoney(total.expense) }}</div>
      <div class="stat-hint">{{ year }} 年累计</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">全年结余</div>
      <div class="stat-value" :class="total.net >= 0 ? 'primary' : 'red'">{{ formatMoney(total.net) }}</div>
      <div class="stat-hint">收入 - 支出</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">月度走势</span>
      <div class="card-actions legend">
        <span><i style="background: #34d399"></i>收入</span>
        <span><i style="background: #f87171"></i>支出</span>
      </div>
    </div>
    <div class="card-body">
      <div class="chart-bars">
        <div v-for="row in months" :key="row.month" class="chart-col" :title="`${row.month} 月`">
          <div style="display: flex; align-items: flex-end; gap: 3px; width: 100%; height: 100%; justify-content: center">
            <div class="chart-bar income" :style="{ height: barHeight(row.income), width: '11px' }"></div>
            <div class="chart-bar expense" :style="{ height: barHeight(row.expense), width: '11px' }"></div>
          </div>
          <div class="chart-month" :style="{ color: row.month === activeMonth ? '#2f6fed' : undefined }">
            {{ row.month }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="split-2" style="margin-top: 16px">
    <div class="card">
      <div class="card-header">
        <span class="card-title">月度明细</span>
        <div class="card-actions text-dim text-sm">单位：元</div>
      </div>
      <div class="card-body tight">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>月份</th>
                <th class="num">收入</th>
                <th class="num">支出</th>
                <th class="num">结余</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in months" :key="row.month">
                <td :style="{ fontWeight: row.month === activeMonth ? 600 : 400, color: row.month === activeMonth ? '#2f6fed' : undefined }">
                  {{ row.month }} 月
                </td>
                <td class="num money-income">{{ row.income ? formatMoney(row.income) : '—' }}</td>
                <td class="num money-expense">{{ row.expense ? formatMoney(row.expense) : '—' }}</td>
                <td class="num" :style="{ color: row.net < 0 ? '#dc2626' : row.net > 0 ? '#1f2937' : '#9ca3af' }">
                  {{ row.net ? formatMoney(row.net) : '—' }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: 600">
                <td>合计</td>
                <td class="num money-income">{{ formatMoney(total.income) }}</td>
                <td class="num money-expense">{{ formatMoney(total.expense) }}</td>
                <td class="num">{{ formatMoney(total.net) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-header"><span class="card-title">支出分类 Top 8</span></div>
        <div class="card-body tight">
          <div v-if="expenseCategories.length === 0" class="empty" style="padding: 26px">本年度暂无支出</div>
          <div v-for="item in expenseCategories" :key="item.category" class="list-row">
            <div class="list-main">
              <div class="list-title">{{ item.category }}</div>
              <div class="progress" style="margin-top: 6px">
                <div class="progress-bar" :style="{ width: (item.percent * 100).toFixed(1) + '%' }"></div>
              </div>
            </div>
            <span class="text-sm" style="width: 52px; text-align: right">{{ formatPercent(item.percent) }}</span>
            <span class="money-expense" style="width: 92px; text-align: right">{{ formatMoney(item.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">收入分类 Top 8</span></div>
        <div class="card-body tight">
          <div v-if="incomeCategories.length === 0" class="empty" style="padding: 26px">本年度暂无收入</div>
          <div v-for="item in incomeCategories" :key="item.category" class="list-row">
            <div class="list-main">
              <div class="list-title">{{ item.category }}</div>
              <div class="progress" style="margin-top: 6px">
                <div class="progress-bar" :style="{ width: (item.percent * 100).toFixed(1) + '%' }"></div>
              </div>
            </div>
            <span class="text-sm" style="width: 52px; text-align: right">{{ formatPercent(item.percent) }}</span>
            <span class="money-income" style="width: 92px; text-align: right">{{ formatMoney(item.amount) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
