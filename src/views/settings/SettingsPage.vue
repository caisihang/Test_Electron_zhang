<script setup lang="ts">
// 设置：常规 / 备份与恢复 / 数据导入导出 / 关于
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import { useAppStore } from '@/stores/app'
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  hasPendingRestore,
  hoursSinceLastBackup,
  listBackups,
  reloadToApply,
  stageRestoreFromBackup,
  stageRestoreFromFile,
} from '@/services/backup'
import { exportContractsXlsx, exportInvoicesXlsx, exportSchedulesXlsx, exportTransactionsXlsx } from '@/services/exporter'
import { notifyPending, notifyPermission, requestNotifyPermission } from '@/services/notifier'
import { runtimeLabel } from '@/services/tauri'
import { SCHEMA_VERSION } from '@/db/schema'
import { formatFileSize } from '@/utils/format'
import type { BackupMeta } from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const tab = ref<'general' | 'backup' | 'io' | 'about'>('general')
const backups = ref<BackupMeta[]>([])
const pendingRestore = ref(false)
const working = ref(false)
const lastBackupHours = ref<number | null>(null)
const permission = ref('')

// 常规设置表单
const reminderDays = ref(store.reminderDays)
const autoBackupEnabled = ref(store.autoBackupEnabled)
const autoBackupHours = ref(store.autoBackupHours)

const tabs = [
  { key: 'general', label: '常规设置' },
  { key: 'backup', label: '备份与恢复' },
  { key: 'io', label: '数据导入导出' },
  { key: 'about', label: '关于' },
] as const

const runtime = runtimeLabel()
const lastBackupText = computed(() => {
  if (lastBackupHours.value === null) return '—'
  if (!Number.isFinite(lastBackupHours.value)) return '还没有备份过'
  if (lastBackupHours.value < 1) return '不到 1 小时前'
  return `${Math.floor(lastBackupHours.value)} 小时前`
})

function syncTabFromRoute(): void {
  const value = String(route.query.tab ?? 'general')
  tab.value = (['general', 'backup', 'io', 'about'].includes(value) ? value : 'general') as typeof tab.value
}

onMounted(() => {
  syncTabFromRoute()
  void refreshBackup()
  // 通知权限需要异步查询（Tauri 走 notification 插件）
  void notifyPermission().then((value) => {
    permission.value = value
  })
})

watch(() => route.query.tab, syncTabFromRoute)

function switchTab(key: (typeof tabs)[number]['key']): void {
  router.replace({ path: '/settings', query: { tab: key } })
}

async function refreshBackup(): Promise<void> {
  backups.value = await listBackups()
  pendingRestore.value = await hasPendingRestore()
  lastBackupHours.value = await hoursSinceLastBackup()
}

// ---------- 常规 ----------
function saveGeneral(): void {
  store.saveReminderDays(Number(reminderDays.value) || 0)
  store.saveAutoBackup(Boolean(autoBackupEnabled.value), Number(autoBackupHours.value) || 24)
  store.refreshBadges()
  reminderDays.value = store.reminderDays
  autoBackupHours.value = store.autoBackupHours
  store.showToast('设置已保存')
}

async function toggleNotify(event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    const result = await requestNotifyPermission()
    permission.value = result
    if (result !== 'granted') {
      store.showToast('系统未授予通知权限，仍可在工作台看到待办', 'error')
      ;(event.target as HTMLInputElement).checked = false
      store.saveNotifyEnabled(false)
      return
    }
  }
  store.saveNotifyEnabled(checked)
  store.showToast(checked ? '已开启启动提醒' : '已关闭启动提醒')
}

async function sendTestNotification(): Promise<void> {
  const result = await requestNotifyPermission()
  permission.value = result
  if (result !== 'granted') {
    store.showToast('请先在系统设置中允许通知', 'error')
    return
  }
  await notifyPending(1, '这是一条测试通知')
  store.showToast('测试通知已发送')
}

// ---------- 备份 ----------
async function backupNow(): Promise<void> {
  working.value = true
  try {
    const meta = await createBackup(false)
    await refreshBackup()
    store.showToast(`备份完成，${formatFileSize(meta.size)}`)
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  } finally {
    working.value = false
  }
}

async function download(item: BackupMeta): Promise<void> {
  try {
    const path = await downloadBackup(item.id)
    if (path !== null) store.showToast('备份包已保存')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

async function restoreFromStore(item: BackupMeta): Promise<void> {
  const ok = await confirmAction({
    title: '从备份恢复',
    message: `将用「${item.created_at}」的备份覆盖当前数据库与附件。恢复采用“暂存 + 重启交换”，重启后才会生效，当前数据会先被替换。建议先做一次立即备份。`,
    confirmText: '暂存恢复',
    danger: true,
  })
  if (!ok) return
  try {
    const result = await stageRestoreFromBackup(item.id)
    await refreshBackup()
    store.showToast(`已暂存恢复（${result.fileCount} 个附件），请重启应用`)
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

async function onImportBackup(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const result = await stageRestoreFromFile(file)
    await refreshBackup()
    store.showToast(`备份已暂存（${result.fileCount} 个附件），请重启应用`)
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  } finally {
    input.value = ''
  }
}

async function removeBackup(item: BackupMeta): Promise<void> {
  const ok = await confirmAction({
    title: '删除备份',
    message: `确定删除「${item.created_at}」的备份包吗？此操作不可恢复。`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  await deleteBackup(item.id)
  await refreshBackup()
  store.showToast('备份已删除', 'info')
}

function applyRestore(): void {
  reloadToApply()
}

// ---------- 导出 ----------
// 桌面端会弹「另存为」；用户取消时 path 为 null
async function safeExport(action: () => Promise<string | null>, label: string): Promise<void> {
  try {
    const path = await action()
    if (path === null) return
    store.showToast(`${label}已保存`)
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}

async function exportFullBackup(): Promise<void> {
  working.value = true
  try {
    const meta = await createBackup(false)
    const path = await downloadBackup(meta.id)
    await refreshBackup()
    if (path !== null) store.showToast('完整备份包已保存')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">设置</div>
      <div class="page-desc">系统能力收拢在此：提醒、备份、导出与分类</div>
    </div>
  </div>

  <div class="card">
    <div class="tabs">
      <button
        v-for="item in tabs"
        :key="item.key"
        class="tab"
        :class="{ active: tab === item.key }"
        type="button"
        @click="switchTab(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- 常规设置 -->
    <div v-if="tab === 'general'" class="card-body tab-pane">
      <div class="split-2">
        <div>
          <h4 style="font-size: 14px; margin-bottom: 12px">提醒</h4>
          <div class="form-grid" style="grid-template-columns: 1fr">
            <div class="field">
              <label>临期提醒天数</label>
              <input v-model.number="reminderDays" class="input num" type="number" min="0" max="30" step="1" />
              <span class="field-hint">工作台待办与菜单徽标按此天数统计（含逾期）</span>
            </div>
            <div class="field">
              <label class="checkbox">
                <input type="checkbox" :checked="store.notifyEnabled" @change="toggleNotify" />
                启动时发送系统通知汇总
              </label>
              <span class="field-hint">
                通知权限：{{ permission === 'granted' ? '已允许' : permission === 'denied' ? '已拒绝（需在系统通知设置中开启）' : permission === 'unsupported' ? '当前环境不支持' : '未申请' }}
              </span>
              <div>
                <button class="btn btn-sm" type="button" @click="sendTestNotification">发送测试通知</button>
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <h4 style="font-size: 14px; margin-bottom: 12px">自动备份</h4>
          <div class="form-grid" style="grid-template-columns: 1fr">
            <div class="field">
              <label class="checkbox">
                <input v-model="autoBackupEnabled" type="checkbox" />
                启动时按间隔自动备份
              </label>
              <span class="field-hint">自动备份保留最近 5 份，手动备份不自动清理</span>
            </div>
            <div class="field">
              <label>备份间隔（小时）</label>
              <input v-model.number="autoBackupHours" class="input num" type="number" min="1" max="720" />
            </div>
          </div>

          <div style="margin-top: 16px">
            <button class="btn btn-primary" type="button" @click="saveGeneral">保存常规设置</button>
          </div>
        </div>

        <div>
          <h4 style="font-size: 14px; margin-bottom: 12px">运行环境</h4>
          <div class="hint-box" style="line-height: 1.9">
            <div><strong>运行方式：</strong>{{ runtime }}</div>
            <div><strong>数据存储：</strong>本机 IndexedDB 中的 SQLite 快照（浏览器预览）</div>
            <div><strong>目录约定：</strong>接入 Tauri 后为 app_data_dir/finance.db + attachments/ + backups/</div>
            <div><strong>网络：</strong>无任何网络请求，无账号体系</div>
          </div>
          <div class="hint-box" style="margin-top: 12px">
            关闭页面或切换浏览器配置前，建议先导出备份包；数据不会上传到任何服务器，也不会自动同步。
          </div>
        </div>
      </div>
    </div>

    <!-- 备份与恢复 -->
    <div v-if="tab === 'backup'" class="card-body tab-pane">
      <div v-if="pendingRestore" class="hint-box" style="margin-bottom: 14px; display: flex; align-items: center; gap: 12px">
        <span style="color: #b45309">已暂存一份恢复数据，重启应用（刷新页面）后生效。</span>
        <button class="btn btn-sm btn-primary" type="button" @click="applyRestore">立即重启应用</button>
      </div>

      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px">
        <button class="btn btn-primary" type="button" :disabled="working" @click="backupNow">
          <NavIcon name="backup" :size="14" /> 立即备份
        </button>
        <label class="btn" style="height: 32px">
          <NavIcon name="upload" :size="14" /> 导入备份包
          <input type="file" accept=".zip" style="display: none" @change="onImportBackup" />
        </label>
        <div class="toolbar-spacer"></div>
        <span class="text-dim text-sm">最近备份：{{ lastBackupText }}</span>
      </div>

      <div class="hint-box" style="margin-bottom: 14px">
        备份包结构：manifest.json（版本与校验信息）+ finance.db（数据库快照）+ attachments/（附件完整拷贝）。
        恢复采用“暂存 + 下次启动交换”，避免运行中直接覆盖数据库导致损坏。
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>备份时间</th>
              <th>类型</th>
              <th class="num">大小</th>
              <th>文件名</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="backups.length === 0">
              <td colspan="5">
                <div class="empty" style="padding: 24px">还没有备份，建议立即备份一次</div>
              </td>
            </tr>
            <tr v-for="item in backups" :key="item.id">
              <td>{{ item.created_at }}</td>
              <td>
                <span class="tag" :class="item.auto ? 'tag-gray' : 'tag-blue'">{{ item.auto ? '自动' : '手动' }}</span>
              </td>
              <td class="num">{{ formatFileSize(item.size) }}</td>
              <td class="text-sm text-muted">{{ item.file_name }}</td>
              <td class="actions">
                <button class="btn btn-link" type="button" @click="download(item)">下载</button>
                <button class="btn btn-link" type="button" @click="restoreFromStore(item)">恢复</button>
                <button class="btn btn-link danger" type="button" @click="removeBackup(item)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 导入导出 -->
    <div v-if="tab === 'io'" class="card-body tab-pane">
      <div class="split-2">
        <div>
          <h4 style="font-size: 14px; margin-bottom: 12px">Excel 导出</h4>
          <div style="display: flex; flex-direction: column; gap: 10px">
            <button class="btn" type="button" style="justify-content: flex-start" @click="safeExport(exportContractsXlsx, '合同台账')">
              <NavIcon name="download" :size="14" /> 导出合同台账（.xlsx）
            </button>
            <button class="btn" type="button" style="justify-content: flex-start" @click="safeExport(exportTransactionsXlsx, '收支流水')">
              <NavIcon name="download" :size="14" /> 导出收支流水（.xlsx）
            </button>
            <button class="btn" type="button" style="justify-content: flex-start" @click="safeExport(exportSchedulesXlsx, '收付款计划')">
              <NavIcon name="download" :size="14" /> 导出收付款计划（.xlsx）
            </button>
            <button class="btn" type="button" style="justify-content: flex-start" @click="safeExport(exportInvoicesXlsx, '发票台账')">
              <NavIcon name="download" :size="14" /> 导出发票台账（.xlsx）
            </button>
          </div>
          <div class="hint-box" style="margin-top: 14px">
            桌面端导出会弹出系统「另存为」对话框，由你选择保存目录；浏览器预览模式则直接下载到默认下载目录。
          </div>
        </div>

        <div>
          <h4 style="font-size: 14px; margin-bottom: 12px">全量数据</h4>
          <div style="display: flex; flex-direction: column; gap: 10px">
            <button class="btn btn-primary" type="button" :disabled="working" @click="exportFullBackup">
              <NavIcon name="backup" :size="14" /> 导出完整备份包（.zip）
            </button>
            <button class="btn" type="button" @click="switchTab('backup')">
              <NavIcon name="upload" :size="14" /> 前往备份与恢复
            </button>
          </div>
          <div class="hint-box" style="margin-top: 14px">
            完整备份包含数据库、全部附件与 manifest，可用于换电脑迁移。恢复前请先备份当前数据。
          </div>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div v-if="tab === 'about'" class="card-body tab-pane">
      <div class="split-2">
        <div>
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px">
            <div class="brand-mark" style="width: 42px; height: 42px; border-radius: 12px; font-size: 20px">财</div>
            <div>
              <div style="font-size: 17px; font-weight: 650">个人财务</div>
              <div class="text-dim text-sm">v0.1.0 · 纯本地 · 单用户</div>
            </div>
          </div>
          <dl class="kv-list">
            <dt>运行方式</dt>
            <dd>{{ runtime }}</dd>
            <dt>前端</dt>
            <dd>Vue 3 + TypeScript + Vite</dd>
            <dt>数据库</dt>
            <dd>SQLite（sql.js / WASM），schema v{{ SCHEMA_VERSION }}</dd>
            <dt>目标形态</dt>
            <dd>Tauri 2.0 + Rust 命令层 + tauri-plugin-sql（Windows NSIS）</dd>
            <dt>备份格式</dt>
            <dd>zip（manifest + finance.db + attachments）</dd>
          </dl>
        </div>
        <div>
          <h4 style="font-size: 14px; margin-bottom: 12px">设计原则</h4>
          <div class="hint-box" style="line-height: 1.9">
            <div>· 不联网、无账号、无云同步</div>
            <div>· 数据库与附件路径由运行环境动态解析，绝不硬编码</div>
            <div>· 附件只存相对路径，换电脑后可解析</div>
            <div>· 无全量操作日志，用软删除 + 删除确认 + 自动备份兜底</div>
            <div>· 提醒只在启动与首页扫描，不承诺后台实时推送</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
