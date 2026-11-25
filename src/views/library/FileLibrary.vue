<script setup lang="ts">
// 合同文件库：资源管理器式层级浏览 + 顶部批量导入区 + 单文件上传
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const desktop = isTauri()
const dir = ref('')
// 完整文件清单（Rust 一次返回所有）
const allFiles = ref<FolderFile[]>([])
const loading = ref(false)
const keyword = ref('')
const typeFilter = ref('all')
// 当前所在的相对路径（空 = 根目录）
const currentPath = ref('')
// 从任意路径进入时累计勾选的文件（不随层级变化而丢失）
const selected = ref<string[]>([])
const previewFile = ref<FolderFile | null>(null)
const previewVisible = ref(false)
const showImport = ref(false)

const TYPE_GROUPS: Record<string, string[]> = {
  pdf: ['pdf'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx'],
  ppt: ['ppt', 'pptx'],
}

/** 面包屑节点：根 + 各级子目录 */
const breadcrumbs = computed(() => {
  const parts = currentPath.value ? currentPath.value.split('/') : []
  const crumbs = [{ name: '根目录', path: '' }]
  let build = ''
  for (const part of parts) {
    build = build ? `${build}/${part}` : part
    crumbs.push({ name: part, path: build })
  }
  return crumbs
})

/** 当前层级的子目录（去重后，按名称排序） */
const subdirs = computed(() => {
  const prefix = currentPath.value ? `${currentPath.value}/` : ''
  const set = new Set<string>()
  for (const file of allFiles.value) {
    if (!file.relative_path.startsWith(prefix)) continue
    const tail = file.relative_path.slice(prefix.length)
    const slash = tail.indexOf('/')
    if (slash === -1) continue // 当前层级的文件，不是子目录
    set.add(tail.slice(0, slash))
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
})

/** 当前层级的文件 */
const currentFiles = computed(() => {
  const prefix = currentPath.value ? `${currentPath.value}/` : ''
  const text = keyword.value.trim().toLowerCase()
  return allFiles.value.filter((file) => {
    if (!file.relative_path.startsWith(prefix)) return false
    const tail = file.relative_path.slice(prefix.length)
    if (tail.includes('/')) return false // 属于更深层目录
    if (text && !file.name.toLowerCase().includes(text)) return false
    if (typeFilter.value !== 'all' && !TYPE_GROUPS[typeFilter.value]?.includes(file.ext)) return false
    return true
  })
})

/** 进入子目录 */
function enterSubdir(name: string): void {
  currentPath.value = currentPath.value ? `${currentPath.value}/${name}` : name
}

/** 跳面包屑 */
function goto(path: string): void {
  currentPath.value = path
}

/** 全选（只选当前可见文件，不碰子目录） */
const allChecked = computed(
  () => currentFiles.value.length > 0 && currentFiles.value.every((f) => selected.value.includes(f.path)),
)
function toggleAll(): void {
  if (allChecked.value) {
    const paths = new Set(currentFiles.value.map((f) => f.path))
    selected.value = selected.value.filter((p) => !paths.has(p))
    return
  }
  const merged = new Set(selected.value)
  currentFiles.value.forEach((f) => merged.add(f.path))
  selected.value = [...merged]
}
function toggleOne(path: string): void {
  selected.value = selected.value.includes(path)
    ? selected.value.filter((p) => p !== path)
    : [...selected.value, path]
}

const selectedFiles = computed(() =>
  selected.value
    .map((p) => allFiles.value.find((f) => f.path === p))
    .filter((f): f is FolderFile => Boolean(f)),
)

/** 扫描根目录 */
async function refresh(): Promise<void> {
  if (!dir.value) return
  loading.value = true
  try {
    allFiles.value = await scanContractFolder(dir.value)
    currentPath.value = ''
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  } finally {
    loading.value = false
  }
}

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

async function uploadSingleFile(): Promise<void> {
  try {
    const paths = await pickContractFiles(false)
    if (paths.length === 0) return
    const picked = await statLocalFiles(paths)
    if (picked.length === 0) {
      store.showToast('仅支持合同类文件', 'error')
      return
    }
    const known = new Set(allFiles.value.map((f) => f.path))
    allFiles.value = [...picked.filter((f) => !known.has(f.path)), ...allFiles.value]
    selected.value = [...new Set([...selected.value, ...picked.map((f) => f.path)])]
    store.showToast(`已添加 ${picked.length} 个文件`)
  } catch (err) {
    store.showToast(err instanceof Error ? err.message : String(err), 'error')
  }
}

function openImport(): void {
  if (!selected.value.length) {
    store.showToast('请先勾选文件', 'info')
    return
  }
  showImport.value = true
}

function onImported(): void {
  selected.value = []
  void refresh()
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
      <div class="page-desc">浏览本地文件夹中的合同文件，可预览或导入台账</div>
    </div>
    <div class="page-actions">
      <button class="btn" type="button" @click="router.push('/library/imported')">
        <NavIcon name="file" :size="14" /> 已导入台账
      </button>
      <button class="btn" type="button" :disabled="!dir" @click="openFolder">
        <NavIcon name="folder" :size="14" /> 打开目录
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

  <!-- 顶部批量导入条：累积到的勾选（跨层级）始终可见 -->
  <div v-if="selectedFiles.length" class="batch-bar">
    <NavIcon name="check" :size="14" />
    <span class="batch-title">已选择 <b>{{ selectedFiles.length }}</b> 个文件</span>
    <div class="batch-tags">
      <span
        v-for="f in selectedFiles.slice(0, 5)"
        :key="f.path"
        class="batch-tag"
        :title="'点击取消：' + f.path"
        @click="toggleOne(f.path)"
      >
        <span class="batch-tag-name">{{ f.name }}</span>
        <span class="batch-tag-path">{{ f.relative_path }}</span>
      </span>
      <span v-if="selectedFiles.length > 5" class="batch-tag batch-tag-more">+{{ selectedFiles.length - 5 }}</span>
    </div>
    <button class="btn btn-primary btn-sm" type="button" @click="openImport">批量导入台账</button>
    <button class="btn btn-link btn-sm" type="button" @click="selected = []">清空</button>
  </div>

  <div class="toolbar">
    <!-- 面包屑 -->
    <div class="breadcrumb">
      <span
        v-for="(crumb, idx) in breadcrumbs"
        :key="idx"
        class="crumb"
        :class="{ active: idx === breadcrumbs.length - 1 }"
        @click="goto(crumb.path)"
      >
        {{ crumb.name }}
      </span>
    </div>
    <div class="toolbar-spacer"></div>
    <input v-model="keyword" class="input search" placeholder="搜索文件名" />
    <select v-model="typeFilter" class="select">
      <option value="all">全部类型</option>
      <option value="pdf">PDF</option>
      <option value="image">图片</option>
      <option value="word">Word</option>
      <option value="excel">Excel</option>
      <option value="ppt">PPT</option>
    </select>
  </div>

  <div class="card">
    <div v-if="loading" class="empty-hint">正在扫描…</div>
    <div v-else-if="!dir" class="empty-hint">点击右上角「选择文件夹」开始</div>
    <div v-else-if="!subdirs.length && !currentFiles.length" class="empty-hint">当前层级没有合同文件</div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th style="width: 36px" v-if="currentFiles.length">
            <input type="checkbox" :checked="allChecked" @change="toggleAll" />
          </th>
          <th v-else style="width: 36px"></th>
          <th>名称</th>
          <th style="width: 80px">类型</th>
          <th style="width: 100px">大小</th>
          <th style="width: 140px">修改时间</th>
          <th style="width: 150px">操作</th>
        </tr>
      </thead>
      <tbody>
        <!-- 父目录 -->
        <tr v-if="currentPath">
          <td class="col-check"></td>
          <td>
            <span class="dir-entry" @click="goto(breadcrumbs[breadcrumbs.length - 2].path)">
              <NavIcon name="folder" :size="18" /> ..
            </span>
          </td>
          <td colspan="4" class="text-dim text-sm">返回上一级</td>
        </tr>
        <!-- 子目录 -->
        <tr v-for="name in subdirs" :key="'d_' + name">
          <td class="col-check"></td>
          <td>
            <span class="dir-entry" @click="enterSubdir(name)">
              <NavIcon name="folder" :size="18" /> {{ name }}
            </span>
          </td>
          <td colspan="4" class="text-dim text-sm">文件夹</td>
        </tr>
        <!-- 当前层级的文件 -->
        <tr v-for="file in currentFiles" :key="file.path">
          <td class="col-check">
            <input
              type="checkbox"
              :checked="selected.includes(file.path)"
              @change="toggleOne(file.path)"
            />
          </td>
          <td class="file-entry" :title="file.relative_path">
            <NavIcon name="file" :size="14" /> {{ file.name }}
          </td>
          <td><span class="tag tag-gray">{{ typeLabel(file.ext) }}</span></td>
          <td class="text-dim text-sm">{{ formatSize(file.size) }}</td>
          <td class="text-dim text-sm">{{ formatStamp(file.modified) }}</td>
          <td>
            <button class="btn btn-link" type="button" @click="openPreview(file)">预览</button>
            <button class="btn btn-link" type="button" @click="selected = [file.path]; openImport()">导入</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <FilePreviewModal v-model="previewVisible" :file="previewFile" />
  <ContractFileImportModal v-model="showImport" :files="selectedFiles" @imported="onImported" />
</template>

<style scoped>
.empty-hint {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}
/* 复选框列固定宽度，与表头 36px 对齐 */
.col-check {
  width: 36px;
  min-width: 36px;
  max-width: 36px;
  text-align: center;
  padding: 11px 0 !important;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f1f5ff;
  color: #1e3a8a;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(30, 58, 138, 0.06);
}
.batch-bar b {
  color: #2f6fed;
  font-weight: 700;
}
.batch-title {
  font-weight: 500;
  flex-shrink: 0;
}
.batch-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.batch-tag {
  max-width: 200px;
  padding: 3px 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #d0d8e8;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.batch-tag:hover {
  border-color: #ef4444;
  background: #fef2f2;
}
.batch-tag-name {
  color: #1e3a8a;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-tag-path {
  color: #64748b;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-tag-more {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #475569;
  font-weight: 600;
}
.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}
.crumb {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.crumb:hover {
  background: var(--bg-2);
  color: var(--text-1);
}
.crumb.active {
  color: var(--text-1);
  font-weight: 500;
  cursor: default;
}
.crumb.active:hover {
  background: transparent;
}
.dir-entry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
/* 文件夹图标染黄（NavIcon 输出 svg，没有 nav-icon 类，所以直接选 svg） */
.dir-entry svg {
  color: #e8a717;
  stroke: #e8a717;
}
.dir-entry:hover svg {
  stroke: #d4970f;
}
.file-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
