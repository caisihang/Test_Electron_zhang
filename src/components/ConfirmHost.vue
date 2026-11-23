// 全局确认框宿主，放在 App.vue 中挂载一次
<script setup lang="ts">
import ModalDialog from './ModalDialog.vue'
import { settleConfirm, useConfirmState } from '@/composables/useConfirm'

const state = useConfirmState()

function cancel(): void {
  settleConfirm(false)
}

function confirm(): void {
  settleConfirm(true)
}
</script>

<template>
  <ModalDialog
    :model-value="state.visible"
    :title="state.title"
    size="sm"
    :close-on-mask="false"
    @update:model-value="cancel"
  >
    <p style="line-height: 1.8; color: #4b5563">{{ state.message }}</p>
    <template #footer>
      <button class="btn" type="button" @click="cancel">{{ state.cancelText }}</button>
      <button class="btn" :class="state.danger ? 'btn-danger' : 'btn-primary'" type="button" @click="confirm">
        {{ state.confirmText }}
      </button>
    </template>
  </ModalDialog>
</template>
