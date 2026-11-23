<script setup lang="ts">
import { computed } from 'vue'
import AppLayout from './layouts/AppLayout.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import NavIcon from './components/NavIcon.vue'
import { useAppStore } from './stores/app'

const store = useAppStore()

// 按提示类型切换图标
const toastIcon = computed(() => {
  if (store.toast.type === 'error') return 'alert'
  if (store.toast.type === 'info') return 'info'
  return 'check'
})
</script>

<template>
  <AppLayout>
    <router-view />
  </AppLayout>
  <ConfirmHost />
  <!-- 轻提示：图标 + 文案 + 底部倒计时进度条；点击可提前关闭 -->
  <div v-if="store.toast.visible" class="toast-wrap">
    <div
      :key="store.toast.nonce"
      class="toast"
      :class="store.toast.type"
      @click="store.toast.visible = false"
    >
      <span class="toast-icon"><NavIcon :name="toastIcon" :size="14" /></span>
      <span class="toast-text">{{ store.toast.text }}</span>
      <span class="toast-bar" />
    </div>
  </div>
</template>
