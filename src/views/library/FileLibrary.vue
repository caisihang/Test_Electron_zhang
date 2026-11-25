<script setup lang="ts">
// 合同文件库：选择本地文件夹，递归浏览其中所有合同文件，支持预览与导入台账
import { computed, onMounted, ref } from 'vue'
import NavIcon from '@/components/NavIcon.vue'
import FilePreviewModal from '@/components/FilePreviewModal.vue'
import ContractFileImportModal from '@/components/ContractFileImportModal.vue'
import { getSetting, setSetting } from '@/db/database'
import {
  formatSize,
  formatStamp,
  openLocalPath,
  pickContractFiles,
  pickContractFolder,
  scanContractFolder,
  statLocalFiles,
  type FolderFile,
} from '@/services/folder'
import { isTauri } from '@/services/tauri'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

const desktop = isTauri()
const dir = ref('')
const files = ref<FolderFile[]>([])
const loading = ref(false)
const keyword = ref('')
const typeFilter = ref('all')
// 当前勾选的文件绝对路径
const selected = ref<string[]>([])
const previewFile = ref<FolderFile | null>(null)
const previewVisible = ref(false)

// 导入台账弹窗
const showImport = ref(false)
// 待导入的文件（与勾选保持同步）
const selectedFiles = computed(() =>
  files.value.filter((file) => selected.value.includes(file.path)),
)

// 扩展名分组
const TYPE_GROUPS: Record<string, string[]> = {
  pdf: ['pdf'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx'],
  ppt: ['ppt', 'pptx'],
}

const filteredFiles = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return files.value.filter((file) => {
    if (text && !`${file.name} ${file.relative_path}`.toLowerCase().includes(text)) return false
    if (typeFilter.value !== 'all' && !TYPE_GROUPS[typeFilter.value]?.includes(file.ext)) return false
    return true
  })
})

const selectedCount = computed(
  () => files.value.filter((file) => selected.value.includes(file.path)).length,
)

const allChecked = computed(
  () => filteredFiles.value.length > 0 && filteredFiles.value.every((file) => selected.value.includes(file.path)),
)

/** 目录路径展示（截断中间部分） */
const dirLabel = computed(() => {
  if (!dir.value) return '尚未选择文件夹'
  return dir.value.length > 56 ? `…${dir.value.slice(-54)}` : dir.value
})

/** 扫描当前目录 */
async function refresh(): Promise<void> {
  if (!dir.value) return
  loading.value = true
  try {
    files.value = await scanContractFolder(dir.value)
    selected.value = []
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  } finally {
    loading.value = false
  }
}

/** 选择文件夹并扫描 */
async function chooseFolder(): Promise<void> {
  try {
    const picked = await pickContractFolder()
    if (!picked) return
    dir.value = picked
    setSetting('contract_root', picked)
    await refresh()
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  }
}

function toggleAll(): void {
  if (allChecked.value) {
    selected.value = selected.value.filter(
      (path) => !filteredFiles.value.some((file) => file.path === path),
    )
    return
  }
  const merged = new Set(selected.value)
  filteredFiles.value.forEach((file) => merged.add(file.path))
  selected.value = [...merged]
}

function toggleOne(path: string): void {
  if (selected.value.includes(path)) {
    selected.value = selected.value.filter((item) => item !== path)
  } else {
    selected.value = [...selected.value, path]
  }
}

function openPreview(file: FolderFile): void {
  previewFile.value = file
  previewVisible.value = true
}

async function openFolder(): Promise<void> {
  if (!dir.value) return
  try {
    await openLocalPath(dir.value)
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  }
}

/** 向上传单个文件：选择后并入列表并自动勾选 */
async function uploadSingleFile(): Promise<void> {
  try {
    const paths = await pickContractFiles(false)
    if (paths.length === 0) return
    const picked = await statLocalFiles(paths)
    if (picked.length === 0) {
      store.showToast('仅支持合同类文件（PDF/Word/Excel/PPT/图片）', 'error')
      return
    }
    // 按路径去重后并入当前列表
    const known = new Set(files.value.map((file) => file.path))
    const merged = [...picked.filter((file) => !known.has(file.path)), ...files.value]
    files.value = merged
    selected.value = [...new Set([...selected.value, ...picked.map((file) => file.path)])]
    store.showToast(`已添加 ${picked.length} 个文件`)
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  }
}

/** 打开导入弹窗 */
function openImport(): void {
  if (!selectedCount.value) {
    store.showToast('请先勾选要导入的文件', 'info')
    return
  }
  showImport.value = true
}

/** 导入完成：刷新勾选状态 */
function onImported(): void {
  selected.value = []
  void refresh()
}

/** 相对路径的目录部分 */
function dirOf(file: FolderFile): string {
  const parts = file.relative_path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '根目录'
}

function typeLabel(ext: string): string {
  return ext ? ext.toUpperCase() : '未知'
}

onMounted(() => {
  if (!desktop) return
  const saved = getSetting('contract_root', '')
  if (!saved) return
  dir.value = saved
  void refresh()
})
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">合同文件库</div>
      <div class="page-desc">选择一个文件夹，浏览其中全部合同文件，可预览或导入台账</div>
    </div>
    <div class="page-actions">
      <button class="btn" type="button" :disabled="!dir" @click="openFolder">
        <NavIcon name="file" :size="14" /> 打开目录
      </button>
      <button class="btn" type="button" :disabled="!dir || loading" @click="refresh">
        <NavIcon name="refresh" :size="14" /> 重新扫描
      </button>
      <button class="btn" type="button" :disabled="!desktop" @click="uploadSingleFile">
        <NavIcon name="upload" :size="14" /> 上传文件
      </button>
      <button class="btn btn-primary" type="button" @click="chooseFolder">
        <NavIcon name="folder" :size="14" /> 选择文件夹
      </button>
    </div>
  </div>

  <div v-if="!desktop" class="hint-box" style="margin-bottom: 12px">
    文件库需要桌面端运行环境（Tauri）。当前为浏览器预览，请使用打包后的 exe 访问。
  </div>

  <div class="toolbar">
    <span class="text-dim text-sm" :title="dir">{{ dirLabel }}</span>
    <div class="toolbar-spacer"></div>
    <input v-model="keyword" class="input search" placeholder="搜索文件名 / 子目录" />
    <select v-model="typeFilter" class="select">
      <option value="all">全部类型</option>
      <option value="pdf">PDF</option>
      <option value="image">图片</option>
      <option value="word">Word</option>
      <option value="excel">Excel</option>
      <option value="ppt">PPT</option>
    </select>
    <button class="btn btn-primary" type="button" :disabled="!selectedCount" @click="openImport">
      导入台账（{{ selectedCount }}）
    </button>
  </div>

  <div class="card">
    <div v-if="loading" class="empty-hint">正在扫描…</div>
    <div v-else-if="!dir" class="empty-hint">点击右上角「选择文件夹」开始</div>
    <div v-else-if="!filteredFiles.length" class="empty-hint">没有符合条件的合同文件</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th style="width: 36px">
            <input type="checkbox" :checked="allChecked" @change="toggleAll" />
          </th>
          <th>文件名</th>
          <th>所在目录</th>
          <th style="width: 80px">类型</th>
          <th style="width: 90px">大小</th>
          <th style="width: 140px">修改时间</th>
          <th style="width: 150px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="file in filteredFiles" :key="file.path">
          <td>
            <input
              type="checkbox"
              :checked="selected.includes(file.path)"
              @change="toggleOne(file.path)"
            />
          </td>
          <td :title="file.path">{{ file.name }}</td>
          <td class="text-dim text-sm">{{ dirOf(file) }}</td>
          <td><span class="tag tag-gray">{{ typeLabel(file.ext) }}</span></td>
          <td class="text-dim text-sm">{{ formatSize(file.size) }}</td>
          <td class="text-dim text-sm">{{ formatStamp(file.modified) }}</td>
          <td>
            <button class="btn btn-link" type="button" @click="openPreview(file)">预览</button>
            <button
              class="btn btn-link"
              type="button"
              @click="selected = [file.path]; openImport()"
            >
              导入
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 文件预览 -->
  <FilePreviewModal v-model="previewVisible" :file="previewFile" />

  <!-- 导入台账（与合同台账共用组件） -->
  <ContractFileImportModal v-model="showImport" :files="selectedFiles" @imported="onImported" />
</template>

<style scoped>
.empty-hint {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}
.radio-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
