<script setup lang="ts">
// 工作台：本月收支、应收应付、账户余额、待办与最近流水
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import { getDashboardSummary, type DashboardData } from '@/db/repositories/analysis'
import { useAppStore } from '@/stores/app'
import { daysFromToday, directionText, formatDate, formatMoney, scheduleStatusText } from '@/utils/format'

const router = useRouter()
const store = useAppStore()
const data = ref<DashboardData | null>(null)

function load(): void {
  data.value = getDashboardSummary(store.reminderDays)
  store.refreshBadges()
}

onMounted(load)

const accounts = computed(() => data.value?.accounts ?? [])
const topAccounts = computed(() => accounts.value.slice(0, 5))
const recent = computed(() => data.value?.recent ?? [])
const pending = computed(() => data.value?.pending ?? [])

// 待办紧急程度文案
function dueHint(dueDate: string): { text: string; cls: string } {
  const days = daysFromToday(dueDate)
  if (days < 0) return { text: `逾期 ${Math.abs(days)} 天`, cls: 'tag-red' }
  if (days === 0) return { text: '今天到期', cls: 'tag-amber' }
  return { text: `${days} 天后`, cls: 'tag-blue' }
}

function goSchedule(): void {
  router.push('/schedules')
}

function goNewContract(): void {
  router.push('/contracts')
}

function goNewTransaction(): void {
  router.push({ path: '/transactions', query: { new: '1' } })
}
</script>

<template>
  <div v-if="data">
    <!-- 指标卡 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">本月收入</div>
        <div class="stat-value green">{{ formatMoney(data.monthIncome) }}</div>
        <div class="stat-hint">按流水日期统计，不含计划</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月支出</div>
        <div class="stat-value red">{{ formatMoney(data.monthExpense) }}</div>
        <div class="stat-hint">与收入同口径按月汇总</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月结余</div>
        <div class="stat-value" :class="data.monthNet >= 0 ? 'primary' : 'red'">
          {{ formatMoney(data.monthNet) }}
        </div>
        <div class="stat-hint">收入 - 支出</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">账户总余额</div>
        <div class="stat-value">{{ formatMoney(data.totalBalance) }}</div>
        <div class="stat-hint">{{ accounts.length }} 个在用账户</div>
      </div>
    </div>

    <div class="stat-grid cols-3" style="margin-top: 14px">
      <div class="stat-card">
        <div class="stat-label">待收款（应收）</div>
        <div class="stat-value green">{{ formatMoney(data.receivable) }}</div>
        <div class="stat-hint">未结清收入计划剩余合计</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">待付款（应付）</div>
        <div class="stat-value red">{{ formatMoney(data.payable) }}</div>
        <div class="stat-hint">未结清支出计划剩余合计</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">需要行动</div>
        <div class="stat-value primary">{{ data.overdueCount + data.dueSoonCount }}</div>
        <div class="stat-hint">逾期 {{ data.overdueCount }} · {{ store.reminderDays }} 天内到期 {{ data.dueSoonCount }}</div>
      </div>
    </div>

    <div class="split-2" style="margin-top: 16px">
      <!-- 待办 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">待办计划</span>
          <span class="card-sub">逾期与临期优先</span>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click="goSchedule">全部计划</button>
          </div>
        </div>
        <div class="card-body tight">
          <div v-if="pending.length === 0" class="empty">
            <strong>近期没有待处理的收付款</strong>
            可以放心安排资金，或先去新建合同
          </div>
          <div v-for="item in pending" :key="item.id" class="list-row">
            <div class="list-main">
              <div class="list-title">{{ item.contract_title }} · {{ item.label || '计划' }}</div>
              <div class="list-sub">{{ item.contract_no }} · 到期 {{ formatDate(item.due_date) }}</div>
            </div>
            <span class="tag" :class="dueHint(item.due_date).cls">{{ dueHint(item.due_date).text }}</span>
            <span :class="item.direction === 'income' ? 'money-income' : 'money-expense'">
              {{ item.direction === 'income' ? '+' : '-' }}{{ formatMoney(item.planned_amount - item.actual_amount) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 账户余额 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">账户余额</span>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click="router.push('/accounts')">管理</button>
          </div>
        </div>
        <div class="card-body tight">
          <div v-if="topAccounts.length === 0" class="empty">还没有账户</div>
          <div v-for="account in topAccounts" :key="account.id" class="list-row">
            <div class="list-main">
              <div class="list-title">{{ account.name }}</div>
              <div class="list-sub">初始余额 {{ formatMoney(account.initial_balance) }}</div>
            </div>
            <span style="font-weight: 600; font-variant-numeric: tabular-nums">{{ formatMoney(account.balance) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="split-2" style="margin-top: 16px">
      <!-- 最近流水 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">最近流水</span>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click="router.push('/transactions')">全部流水</button>
          </div>
        </div>
        <div class="card-body tight">
          <div v-if="recent.length === 0" class="empty">
            <strong>还没有记过流水</strong>
            记下第一笔真实收付，报表才有意义
          </div>
          <div v-for="txn in recent" :key="txn.id" class="list-row">
            <div class="list-main">
              <div class="list-title">
                {{ txn.counterparty || txn.note || directionText[txn.direction] }}
                <span v-if="txn.contract_title" class="tag tag-blue" style="margin-left: 6px">{{ txn.contract_title }}</span>
              </div>
              <div class="list-sub">
                {{ formatDate(txn.txn_date) }} · {{ txn.account_name }}
                <template v-if="txn.category_l1"> · {{ txn.category_l1 }}{{ txn.category_l2 ? ' / ' + txn.category_l2 : '' }}</template>
              </div>
            </div>
            <span :class="txn.direction === 'income' ? 'money-income' : 'money-expense'" style="font-weight: 600">
              {{ txn.direction === 'income' ? '+' : '-' }}{{ formatMoney(txn.amount) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="card">
        <div class="card-header"><span class="card-title">快捷操作</span></div>
        <div class="card-body" style="display: flex; flex-direction: column; gap: 10px">
          <button class="btn" type="button" style="justify-content: flex-start" @click="goNewContract">
            <NavIcon name="contract" :size="15" /> 新建合同，生成收付款计划
          </button>
          <button class="btn" type="button" style="justify-content: flex-start" @click="goNewTransaction">
            <NavIcon name="transaction" :size="15" /> 记一笔收付款
          </button>
          <button class="btn" type="button" style="justify-content: flex-start" @click="router.push('/analysis/income-expense')">
            <NavIcon name="analysis" :size="15" /> 查看月度收支结余
          </button>
          <div class="divider" style="margin: 4px 0"></div>
          <div class="hint-box">
            数据只保存在本机，不联网、无账号。建议每周在「设置 - 备份与恢复」导出一份备份包。
          </div>
        </div>
      </div>
    </div>

    <p class="text-dim text-sm" style="margin-top: 14px">
      待办口径：未结清且到期日在 {{ store.reminderDays }} 天内（含逾期）。可在设置中调整提醒天数。
    </p>
  </div>
</template>
