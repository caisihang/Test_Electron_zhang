<script setup lang="ts">
// 文件预览弹窗：图片走 asset 协议；PDF / 文本由 Rust 读取字节生成 Blob，避免 WebView2 对本地 PDF 的兼容问题
import { onBeforeUnmount, ref, watch } from 'vue'
import NavIcon from './NavIcon.vue'
import ModalDialog from './ModalDialog.vue'
import {
  localFileSrc,
  openLocalPath,
  previewKind,
  readFileBytes,
  type PreviewKind,
} from '@/services/folder'

const props = defineProps<{
  modelValue: boolean
  file: { name: string; path: string; ext: string } | null
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const kind = ref<PreviewKind>('other')
const url = ref('')
const text = ref('')
const loading = ref(false)
const error = ref('')
// 当前 Blob URL，关闭时需要释放
let objectUrl = ''

/** 释放 Blob URL 与预览状态 */
function cleanup(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
  url.value = ''
  text.value = ''
  error.value = ''
}

/** 按文件类型加载预览内容 */
async function load(): Promise<void> {
  cleanup()
  if (!props.file) return
  kind.value = previewKind(props.file.ext)

  if (kind.value === 'image') {
    url.value = localFileSrc(props.file.path)
    return
  }

  if (kind.value !== 'pdf' && kind.value !== 'text') return

  loading.value = true
  try {
    const buffer = await readFileBytes(props.file.path)
    if (kind.value === 'text') {
      text.value = new TextDecoder('utf-8').decode(buffer)
    } else {
      objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
      url.value = objectUrl
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.file?.path] as const,
  ([visible]) => {
    if (visible) void load()
    else cleanup()
  },
)

onBeforeUnmount(cleanup)

/** 调用系统默认程序打开 */
async function openSystem(): Promise<void> {
  if (!props.file) return
  try {
    await openLocalPath(props.file.path)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="file?.name || '文件预览'"
    size="lg"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="preview-body">
      <div v-if="loading" class="preview-hint">加载中…</div>
      <div v-else-if="error" class="preview-hint preview-error">{{ error }}</div>
      <img v-else-if="kind === 'image' && url" :src="url" :alt="file?.name" class="preview-image" />
      <iframe v-else-if="kind === 'pdf' && url" :src="url" class="preview-frame" title="PDF 预览" />
      <pre v-else-if="kind === 'text'" class="preview-text">{{ text }}</pre>
      <div v-else class="preview-hint">该格式暂不支持页内预览，请使用系统程序打开。</div>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="openSystem">
        <NavIcon name="file" :size="14" /> 用系统程序打开
      </button>
      <button class="btn btn-primary" type="button" @click="emit('update:modelValue', false)">
        关闭
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.preview-body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}
.preview-hint {
  padding: 40px 16px;
  color: var(--text-2);
  font-size: 13px;
  text-align: center;
}
.preview-error {
  color: var(--danger, #d93025);
}
.preview-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 8px;
}
.preview-frame {
  width: 100%;
  height: 70vh;
  border: 0;
  border-radius: 8px;
  background: #fff;
}
.preview-text {
  width: 100%;
  max-height: 70vh;
  overflow: auto;
  margin: 0;
  padding: 12px;
  background: var(--bg-2, #f6f7f9);
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
