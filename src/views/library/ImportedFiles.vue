<script setup lang="ts">
// 已导入台账的文件：按合同分组展示，可预览或跳转合同详情
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'
import FilePreviewModal from '@/components/FilePreviewModal.vue'
import { listContractFiles, deleteContractFile } from '@/db/repositories/contractFiles'
import type { ContractFile } from '@/types/models'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const store = useAppStore()

const keyword = ref('')
const files = ref<ContractFile[]>([])
const previewFile = ref<ContractFile | null>(null)
const previewVisible = ref(false)

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  if (!text) return files.value
  return files.value.filter((f) =>
    `${f.name} ${f.contract_title ?? ''} ${f.source_path ?? ''}`.toLowerCase().includes(text),
  )
})

// 按合同分组：未归档的放"未分配"
const grouped = computed(() => {
  const map = new Map<number | null, { title: string; files: ContractFile[] }>()
  for (const f of filtered.value) {
    const key = f.contract_id
    if (!map.has(key)) {
      const title = key
        ? (files.value.find((x) => x.contract_id === key && x.contract_title)?.contract_title ?? '未分配')
        : '未分配文件'
      map.set(key, { title, files: [] })
    }
    map.get(key)!.files.push(f)
  }
  return [...map.entries()].sort((a, b) => {
    if (a[0] === null) return 1
    if (b[0] === null) return -1
    return a[1].title.localeCompare(b[1].title, 'zh')
  })
})

function load(): void {
  files.value = listContractFiles()
}

onMounted(load)

function openPreview(row: ContractFile): void {
  previewFile.value = row
  previewVisible.value = true
}

function openContract(id: number | null): void {
  if (id) void router.push(`/contracts/${id}`)
}

async function handleDelete(row: ContractFile): Promise<void> {
  if (!confirm(`从台账移除「${row.name}」的索引记录？\n磁盘文件不会被删除。`)) return
  deleteContractFile(row.id)
  store.showToast('已从台账移除该文件索引', 'info')
  load()
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">已导入台账的文件</div>
      <div class="page-desc">合同文件库中被纳入台账的文件，按合同分组管理</div>
    </div>
    <div class="page-actions">
      <button class="btn" type="button" @click="router.push('/library')">
        <NavIcon name="folder" :size="14" /> 返回文件库
      </button>
    </div>
  </div>

  <div class="toolbar">
    <span class="text-dim text-sm">共 {{ files.length }} 个文件，分布于 {{ grouped.length }} 个分组</span>
    <div class="toolbar-spacer"></div>
    <input v-model="keyword" class="input search" placeholder="搜索文件名 / 合同 / 原始路径" />
  </div>

  <div v-if="!files.length" class="empty-hint">
    还没有文件被纳入台账。去「合同文件库」选文件夹 → 勾选文件 → 批量导入台账。
  </div>

  <div v-for="[contractId, group] in grouped" :key="contractId ?? 'none'" class="group-card">
    <div class="group-header" @click="contractId && openContract(contractId)">
      <NavIcon :name="contractId ? 'contract' : 'file'" :size="14" />
      <span class="group-title">{{ group.title }}</span>
      <span class="tag tag-gray">{{ group.files.length }}</span>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>文件名</th>
          <th>原始路径</th>
          <th style="width: 100px">大小</th>
          <th style="width: 100px">类型</th>
          <th style="width: 160px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in group.files" :key="f.id">
          <td class="file-entry" :title="f.rel_path">
            <NavIcon name="file" :size="14" /> {{ f.name }}
          </td>
          <td class="text-dim text-sm">{{ f.source_path ?? '—' }}</td>
          <td class="text-dim text-sm">{{ (f.size / 1024).toFixed(1) }} KB</td>
          <td><span class="tag tag-gray">{{ (f.mime.split('/').pop() ?? '').toUpperCase() || '未知' }}</span></td>
          <td>
            <button class="btn btn-link" type="button" @click="openPreview(f)">预览</button>
            <button class="btn btn-link" type="button" @click="handleDelete(f)">移除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <FilePreviewModal v-model="previewVisible" :file="previewFile as any" />
</template>

<style scoped>
.empty-hint {
  padding: 64px 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}
.group-card {
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-2);
  cursor: pointer;
}
.group-title {
  font-weight: 500;
  color: var(--text-1);
  flex: 1;
}
.file-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px; ; /* 或者写死 height: 32px; */
}
</style>
