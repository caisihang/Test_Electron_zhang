<script setup lang="ts">
import AppLayout from './layouts/AppLayout.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import { useAppStore } from './stores/app'

const store = useAppStore()
</script>

<template>
  <AppLayout>
    <router-view />
  </AppLayout>
  <ConfirmHost />
  <div v-if="store.toast.visible" class="toast-wrap">
    <div class="toast" :class="store.toast.type">{{ store.toast.text }}</div>
  </div>
</template>
