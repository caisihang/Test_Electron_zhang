// 应用框架：左侧可折叠菜单 + 顶部栏 + 内容区
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

// P1 功能开关（发票登记、回收站按 README 暂不开放一级入口）
const FEATURE_P1 = false

const collapsed = ref(localStorage.getItem('sidebar-collapsed') === '1')

interface MenuItem {
  label: string
  to: string
  icon: string
  badge?: number
  exact?: boolean
  tab?: string
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const groups = computed<MenuGroup[]>(() => {
  const list: MenuGroup[] = [
    {
      title: '',
      items: [{ label: '工作台', to: '/', icon: 'dashboard', badge: store.todoCount, exact: true }],
    },
    {
      title: '业务',
      items: [
        { label: '合同台账', to: '/contracts', icon: 'contract', badge: store.overdueContracts },
        { label: '收付款计划', to: '/schedules', icon: 'schedule', badge: store.overdueSchedules },
      ],
    },
    {
      title: '资金',
      items: [
        { label: '收支流水', to: '/transactions', icon: 'transaction' },
        { label: '账户管理', to: '/accounts', icon: 'account' },
        { label: '收支分类', to: '/categories', icon: 'category' },
      ],
    },
    {
      title: '分析',
      items: [
        { label: '合同执行表', to: '/analysis/contracts', icon: 'analysis' },
        { label: '收支结余表', to: '/analysis/income-expense', icon: 'analysis' },
      ],
    },
  ]

  // P1：发票登记 / 回收站，默认隐藏
  if (FEATURE_P1) {
    list.splice(3, 0, {
      title: '票据',
      items: [{ label: '发票登记', to: '/invoices', icon: 'invoice' }],
    })
  }

  list.push({
    title: '设置',
    items: [
      { label: '常规设置', to: '/settings', icon: 'settings', tab: 'general' },
      { label: '备份与恢复', to: '/settings', icon: 'backup', tab: 'backup' },
      { label: '数据导入导出', to: '/settings', icon: 'download', tab: 'io' },
      { label: '关于', to: '/settings', icon: 'info', tab: 'about' },
    ],
  })
  return list
})

const pageTitle = computed(() => (route.meta.title as string) ?? '个人财务')
const pageDesc = computed(() => (route.meta.desc as string) ?? '')
const todayText = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'long',
})

function toggleCollapse(): void {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar-collapsed', collapsed.value ? '1' : '0')
}

function isActive(item: MenuItem): boolean {
  if (item.tab) {
    return route.path === '/settings' && (route.query.tab ?? 'general') === item.tab
  }
  if (item.exact) return route.path === item.to
  return route.path.startsWith(item.to)
}

function go(item: MenuItem): void {
  router.push(item.tab ? { path: item.to, query: { tab: item.tab } } : item.to)
}

function quickAdd(): void {
  router.push({ path: '/transactions', query: { new: '1' } })
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed }">
      <div class="sidebar-brand">
        <div class="brand-mark">财</div>
        <div class="brand-text">
          <strong>个人财务</strong>
          <span>纯本地 · 单用户</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div v-for="group in groups" :key="group.title || 'main'">
          <div class="nav-group-title">{{ group.title }}</div>
          <a
            v-for="item in group.items"
            :key="item.label"
            class="nav-item"
            :class="{ active: isActive(item) }"
            href="javascript:void(0)"
            :title="item.label"
            @click="go(item)"
          >
            <span class="nav-icon"><NavIcon :name="item.icon" /></span>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge && item.badge > 0" class="nav-badge">{{ item.badge > 99 ? '99+' : item.badge }}</span>
          </a>
        </div>
      </nav>

      <div class="sidebar-foot">数据保存在本机，不联网 · v0.1.0</div>
    </aside>

    <main class="main">
      <header class="topbar">
        <button class="icon-btn" type="button" :title="collapsed ? '展开菜单' : '收起菜单'" @click="toggleCollapse">
          <NavIcon :name="collapsed ? 'expand' : 'collapse'" />
        </button>
        <div>
          <div class="topbar-title">{{ pageTitle }}</div>
          <div class="topbar-sub">{{ pageDesc }}</div>
        </div>
        <div class="topbar-spacer"></div>
        <span class="text-dim text-sm">{{ todayText }}</span>
        <button class="btn btn-primary btn-sm" type="button" @click="quickAdd">
          <NavIcon name="plus" :size="14" /> 记一笔
        </button>
      </header>

      <div class="page">
        <slot />
      </div>
    </main>
  </div>
</template>
