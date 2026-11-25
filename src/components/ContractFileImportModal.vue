<script setup lang="ts">
// 合同文件导入台账：文件库与合同台账共用
// 支持两种方式：每个文件新建合同 / 挂到已有合同
import { computed, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { createContract, listContracts, nextContractNo } from '@/db/repositories/contracts'
import { addContractFile } from '@/db/repositories/contractFiles'
import { importAttachmentFromPath } from '@/services/attachment'
import { mimeFromExt, type FolderFile } from '@/services/folder'
import { useAppStore } from '@/stores/app'
import type { ContractRow, Direction } from '@/types/models'

const props = defineProps<{
  modelValue: boolean
  files: FolderFile[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  imported: [count: number]
}>()

const store = useAppStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const importing = ref(false)
const mode = ref<'new' | 'existing'>('new')
const direction = ref<Direction>('income')
const counterparty = ref('')
const contractId = ref(0)
const contracts = ref<ContractRow[]>([])

// 每次打开都重新拉取合同列表，避免新增合同后下拉过期
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    contracts.value = listContracts({})
    contractId.value = contracts.value[0]?.id ?? 0
    mode.value = 'new'
    direction.value = 'income'
    counterparty.value = ''
  },
)

async function submit(): Promise<void> {
  if (props.files.length === 0) return
  if (mode.value === 'existing' && !contractId.value) {
    store.showToast('请选择目标合同', 'error')
    return
  }
  importing.value = true
  try {
    for (const file of props.files) {
      let targetId = contractId.value
      if (mode.value === 'new') {
        const title = file.name.replace(/\.[^.]+$/, '') || file.name
        targetId = createContract({
          contract_no: nextContractNo(),
          title,
          direction: direction.value,
          counterparty: counterparty.value.trim() || '待补充',
          sign_date: null,
          start_date: null,
          end_date: null,
          total_amount: 0,
          status: 'active',
          note: `来源文件：${file.relative_path}`,
        })
      }
      const relPath = await importAttachmentFromPath(file.path, 'contract', targetId)
      addContractFile({
        contract_id: targetId,
        rel_path: relPath,
        name: file.name,
        size: file.size,
        mime: mimeFromExt(file.ext),
        source_path: file.relative_path,
      })
    }
    store.refreshBadges()
    visible.value = false
    emit('imported', props.files.length)
  } catch (error) {
    store.showToast(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <ModalDialog v-model="visible" title="导入台账" size="md">
    <div class="form-grid">
      <div class="form-row">
        <label class="form-label">导入方式</label>
        <div class="form-control" style="display: flex; gap: 16px">
          <label class="radio-line">
            <input v-model="mode" type="radio" value="new" /> 每个文件新建合同
          </label>
          <label class="radio-line">
            <input v-model="mode" type="radio" value="existing" /> 挂到已有合同
          </label>
        </div>
      </div>

      <template v-if="mode === 'new'">
        <div class="form-row">
          <label class="form-label">合同方向</label>
          <div class="form-control">
            <select v-model="direction" class="select">
              <option value="income">收入合同</option>
              <option value="expense">支出合同</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">往来方</label>
          <div class="form-control">
            <input v-model="counterparty" class="input" placeholder="可留空，后续在台账补充" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="form-row">
          <label class="form-label">目标合同</label>
          <div class="form-control">
            <select v-model.number="contractId" class="select">
              <option v-for="item in contracts" :key="item.id" :value="item.id">
                {{ item.contract_no }} · {{ item.title }}
              </option>
            </select>
            <div v-if="!contracts.length" class="form-hint">暂无合同，请先选择「新建合同」</div>
          </div>
        </div>
      </template>

      <div class="form-hint">
        将导入 {{ files.length }} 个文件；文件会复制到应用数据目录，原文件夹不受影响。
      </div>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="visible = false">取消</button>
      <button class="btn btn-primary" type="button" :disabled="importing" @click="submit">
        {{ importing ? '导入中…' : '开始导入' }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.radio-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
