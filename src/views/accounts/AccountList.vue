<script setup lang="ts">
// 账户管理：初始余额 + 流水汇总 = 实时余额
import { computed, onMounted, reactive, ref } from 'vue'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import {
  accountTransactionCount,
  createAccount,
  listAccounts,
  setAccountArchived,
  updateAccount,
} from '@/db/repositories/accounts'
import type { AccountType, AccountWithBalance } from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'
import { accountTypeText, formatMoney } from '@/utils/format'

const store = useAppStore()
const rows = ref<AccountWithBalance[]>([])
const showForm = ref(false)

const form = reactive({
  id: 0,
  name: '',
  account_type: 'bank' as AccountType,
  initial_balance: 0,
})

const totalBalance = computed(() => rows.value.reduce((sum, row) => sum + Number(row.balance || 0), 0))
const activeCount = computed(() => rows.value.filter((row) => row.is_archived === 0).length)

function load(): void {
  rows.value = listAccounts(true)
}

onMounted(load)

function openCreate(): void {
  form.id = 0
  form.name = ''
  form.account_type = 'bank'
  form.initial_balance = 0
  showForm.value = true
}

function openEdit(row: AccountWithBalance): void {
  form.id = row.id
  form.name = row.name
  form.account_type = row.account_type
  form.initial_balance = row.initial_balance
  showForm.value = true
}

function submit(): void {
  if (!form.name.trim()) {
    store.showToast('请填写账户名称', 'error')
    return
  }
  const payload = {
    name: form.name,
    account_type: form.account_type,
    initial_balance: Number(form.initial_balance) || 0,
  }
  if (form.id) updateAccount(form.id, payload)
  else createAccount(payload)
  showForm.value = false
  load()
  store.showToast('账户已保存')
}

async function toggleArchive(row: AccountWithBalance): Promise<void> {
  if (row.is_archived === 0 && accountTransactionCount(row.id) > 0) {
    const ok = await confirmAction({
      title: '归档账户',
      message: '该账户已有流水，归档后不再出现在记账账户列表中，历史流水与余额仍会保留。',
      confirmText: '归档',
    })
    if (!ok) return
  }
  setAccountArchived(row.id, row.is_archived === 0)
  load()
  store.showToast(row.is_archived === 0 ? '账户已归档' : '账户已启用', 'info')
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">账户管理</div>
      <div class="page-desc">余额 = 初始余额 + 收入流水 - 支出流水</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-primary" type="button" @click="openCreate">
        <NavIcon name="plus" :size="14" /> 新建账户
      </button>
    </div>
  </div>

  <div class="stat-grid cols-3" style="margin-bottom: 16px">
    <div class="stat-card">
      <div class="stat-label">账户总余额</div>
      <div class="stat-value">{{ formatMoney(totalBalance) }}</div>
      <div class="stat-hint">含所有未归档账户</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">在用账户</div>
      <div class="stat-value primary">{{ activeCount }}</div>
      <div class="stat-hint">共 {{ rows.length }} 个账户</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">已归档</div>
      <div class="stat-value">{{ rows.length - activeCount }}</div>
      <div class="stat-hint">归档不影响历史数据</div>
    </div>
  </div>

  <div class="card">
    <div class="card-body tight">
      <div v-if="rows.length === 0" class="empty">
        <strong>还没有账户</strong>
        先添加银行卡、微信、支付宝或现金账户
      </div>
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>账户</th>
              <th>类型</th>
              <th class="num">初始余额</th>
              <th class="num">累计收入</th>
              <th class="num">累计支出</th>
              <th class="num">当前余额</th>
              <th>状态</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td><span class="cell-main">{{ row.name }}</span></td>
              <td><span class="tag tag-gray">{{ accountTypeText[row.account_type] }}</span></td>
              <td class="num">{{ formatMoney(row.initial_balance) }}</td>
              <td class="num money-income">{{ formatMoney(row.income_total) }}</td>
              <td class="num money-expense">{{ formatMoney(row.expense_total) }}</td>
              <td class="num" style="font-weight: 600">{{ formatMoney(row.balance) }}</td>
              <td>
                <span class="tag" :class="row.is_archived ? 'tag-gray' : 'tag-green'">
                  {{ row.is_archived ? '已归档' : '使用中' }}
                </span>
              </td>
              <td class="actions">
                <button class="btn btn-link" type="button" @click="openEdit(row)">编辑</button>
                <button class="btn btn-link" type="button" @click="toggleArchive(row)">
                  {{ row.is_archived ? '启用' : '归档' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ModalDialog v-model="showForm" :title="form.id ? '编辑账户' : '新建账户'" size="sm">
    <div class="form-grid" style="grid-template-columns: 1fr">
      <div class="field">
        <label>账户名称 <span class="req">*</span></label>
        <input v-model="form.name" class="input" placeholder="招商银行卡 / 微信 / 现金" />
      </div>
      <div class="field">
        <label>账户类型</label>
        <select v-model="form.account_type" class="select">
          <option value="bank">银行卡</option>
          <option value="wechat">微信</option>
          <option value="alipay">支付宝</option>
          <option value="cash">现金</option>
        </select>
      </div>
      <div class="field">
        <label>初始余额</label>
        <input v-model.number="form.initial_balance" class="input num" type="number" step="0.01" />
        <span class="field-hint">建账时该账户已有的金额</span>
      </div>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="showForm = false">取消</button>
      <button class="btn btn-primary" type="button" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
