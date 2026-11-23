<script setup lang="ts">
// 合同新增 / 编辑弹窗（列表与详情页共用）
import { computed, reactive, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { createContract, nextContractNo, updateContract, type ContractInput } from '@/db/repositories/contracts'
import type { Contract, ContractStatus, Direction } from '@/types/models'
import { today } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  contract?: Contract | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', id: number): void
}>()

const isEdit = computed(() => Boolean(props.contract?.id))
const error = ref('')
const saving = ref(false)

const form = reactive<ContractInput>({
  contract_no: '',
  title: '',
  direction: 'income',
  counterparty: '',
  sign_date: today(),
  start_date: today(),
  end_date: '',
  total_amount: 0,
  status: 'active',
  note: '',
})
const reason = ref('')

// 打开时回填或重置
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return
    error.value = ''
    reason.value = ''
    const source = props.contract
    if (source) {
      form.contract_no = source.contract_no
      form.title = source.title
      form.direction = source.direction
      form.counterparty = source.counterparty
      form.sign_date = source.sign_date ?? ''
      form.start_date = source.start_date ?? ''
      form.end_date = source.end_date ?? ''
      form.total_amount = source.total_amount
      form.status = source.status
      form.note = source.note ?? ''
    } else {
      form.contract_no = nextContractNo()
      form.title = ''
      form.direction = 'income'
      form.counterparty = ''
      form.sign_date = today()
      form.start_date = today()
      form.end_date = ''
      form.total_amount = 0
      form.status = 'active'
      form.note = ''
    }
  },
  { immediate: true },
)

function close(): void {
  emit('update:modelValue', false)
}

function submit(): void {
  error.value = ''
  if (!form.contract_no.trim()) {
    error.value = '请填写合同编号'
    return
  }
  if (!form.title.trim()) {
    error.value = '请填写合同名称'
    return
  }
  if (!form.counterparty.trim()) {
    error.value = '请填写对方单位'
    return
  }
  if (Number(form.total_amount) <= 0) {
    error.value = '合同金额需大于 0'
    return
  }
  if (form.start_date && form.end_date && form.start_date > form.end_date) {
    error.value = '结束日期不能早于开始日期'
    return
  }

  saving.value = true
  try {
    let id = props.contract?.id ?? 0
    if (isEdit.value && id) {
      updateContract(id, { ...form, total_amount: Number(form.total_amount) }, reason.value)
    } else {
      id = createContract({ ...form, total_amount: Number(form.total_amount) })
    }
    emit('saved', id)
    close()
  } catch (err) {
    error.value = String(err instanceof Error ? err.message : err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="isEdit ? '编辑合同' : '新建合同'"
    size="lg"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form-grid">
      <div class="field">
        <label>合同编号 <span class="req">*</span></label>
        <input v-model="form.contract_no" class="input" placeholder="HT-20261123-001" />
      </div>
      <div class="field">
        <label>合同名称 <span class="req">*</span></label>
        <input v-model="form.title" class="input" placeholder="如：XX 项目开发合同" />
      </div>
      <div class="field">
        <label>方向 <span class="req">*</span></label>
        <select v-model="form.direction" class="select">
          <option :value="'income' as Direction">收入合同（我方收款）</option>
          <option :value="'expense' as Direction">支出合同（我方付款）</option>
        </select>
      </div>
      <div class="field">
        <label>对方单位 <span class="req">*</span></label>
        <input v-model="form.counterparty" class="input" placeholder="公司 / 个人名称" />
      </div>
      <div class="field">
        <label>合同金额 <span class="req">*</span></label>
        <input v-model.number="form.total_amount" class="input num" type="number" min="0" step="0.01" />
      </div>
      <div class="field">
        <label>状态</label>
        <select v-model="form.status" class="select">
          <option :value="'draft' as ContractStatus">草稿</option>
          <option :value="'active' as ContractStatus">执行中</option>
          <option :value="'completed' as ContractStatus">已完成</option>
          <option :value="'terminated' as ContractStatus">已终止</option>
        </select>
      </div>
      <div class="field">
        <label>签订日期</label>
        <input v-model="form.sign_date" class="input" type="date" />
      </div>
      <div class="field">
        <label>开始日期</label>
        <input v-model="form.start_date" class="input" type="date" />
      </div>
      <div class="field">
        <label>结束日期</label>
        <input v-model="form.end_date" class="input" type="date" />
      </div>
      <div v-if="isEdit" class="field">
        <label>变更说明</label>
        <input v-model="reason" class="input" placeholder="金额 / 日期变更原因，写入变更记录" />
      </div>
      <div class="field span-2">
        <label>备注</label>
        <textarea v-model="form.note" class="textarea" placeholder="合同要点、付款条件等"></textarea>
      </div>
    </div>
    <p v-if="error" style="color: #dc2626; font-size: 12.5px; margin-top: 12px">{{ error }}</p>
    <template #footer>
      <button class="btn" type="button" @click="close">取消</button>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </template>
  </ModalDialog>
</template>
