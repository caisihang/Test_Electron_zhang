<script setup lang="ts">
// 收支分类：两级结构，支持新增子类与删除校验
import { computed, onMounted, reactive, ref } from 'vue'
import NavIcon from '@/components/NavIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { buildCategoryTree, createCategory, deleteCategory, updateCategory } from '@/db/repositories/categories'
import type { CategoryNode, Direction } from '@/types/models'
import { confirmAction } from '@/composables/useConfirm'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const expenseTree = ref<CategoryNode[]>([])
const incomeTree = ref<CategoryNode[]>([])
const showForm = ref(false)
const form = reactive({
  mode: 'root' as 'root' | 'child' | 'edit',
  id: 0,
  parent_id: null as number | null,
  direction: 'expense' as Direction,
  name: '',
})

const dialogTitle = computed(() => {
  if (form.mode === 'root') return '新增一级分类'
  if (form.mode === 'child') return '新增二级分类'
  return '编辑分类'
})

function load(): void {
  expenseTree.value = buildCategoryTree('expense')
  incomeTree.value = buildCategoryTree('income')
}

onMounted(load)

function openRoot(direction: Direction): void {
  form.mode = 'root'
  form.id = 0
  form.parent_id = null
  form.direction = direction
  form.name = ''
  showForm.value = true
}

function openChild(parent: CategoryNode): void {
  form.mode = 'child'
  form.id = 0
  form.parent_id = parent.id
  form.direction = parent.direction
  form.name = ''
  showForm.value = true
}

function openEdit(node: CategoryNode): void {
  form.mode = 'edit'
  form.id = node.id
  form.parent_id = node.parent_id
  form.direction = node.direction
  form.name = node.name
  showForm.value = true
}

function submit(): void {
  if (!form.name.trim()) {
    store.showToast('请填写分类名称', 'error')
    return
  }
  if (form.mode === 'edit') {
    updateCategory(form.id, { name: form.name, sort_order: 0 })
  } else {
    createCategory({ parent_id: form.parent_id, name: form.name, direction: form.direction })
  }
  showForm.value = false
  load()
  store.showToast('分类已保存')
}

async function remove(node: CategoryNode): Promise<void> {
  const ok = await confirmAction({
    title: '删除分类',
    message: `确定删除分类「${node.name}」吗？有子分类或已被流水使用时无法删除。`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  try {
    deleteCategory(node.id)
    load()
    store.showToast('分类已删除')
  } catch (error) {
    store.showToast(String(error instanceof Error ? error.message : error), 'error')
  }
}
</script>

<template>
  <div class="page-header">
    <div>
      <div class="page-title">收支分类</div>
      <div class="page-desc">两级分类足够个人记账；删不掉的分类说明仍被流水使用</div>
    </div>
  </div>

  <div class="split-2">
    <!-- 支出分类 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">支出分类</span>
        <span class="card-sub">{{ expenseTree.length }} 个一级</span>
        <div class="card-actions">
          <button class="btn btn-sm" type="button" @click="openRoot('expense')">
            <NavIcon name="plus" :size="13" /> 一级分类
          </button>
        </div>
      </div>
      <div class="card-body tight">
        <div v-if="expenseTree.length === 0" class="empty">还没有支出分类</div>
        <div v-for="node in expenseTree" :key="node.id">
          <div class="list-row">
            <div class="list-main">
              <div class="list-title">{{ node.name }}</div>
              <div class="list-sub">{{ node.children.length }} 个二级分类</div>
            </div>
            <button class="btn btn-link" type="button" @click="openChild(node)">加子类</button>
            <button class="btn btn-link" type="button" @click="openEdit(node)">改名</button>
            <button class="btn btn-link danger" type="button" @click="remove(node)">删除</button>
          </div>
          <div v-for="child in node.children" :key="child.id" class="list-row" style="padding-left: 36px; background: #fcfdfe">
            <div class="list-main">
              <div class="list-title" style="font-weight: 400">{{ child.name }}</div>
            </div>
            <button class="btn btn-link" type="button" @click="openEdit(child)">改名</button>
            <button class="btn btn-link danger" type="button" @click="remove(child)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 收入分类 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">收入分类</span>
        <span class="card-sub">{{ incomeTree.length }} 个一级</span>
        <div class="card-actions">
          <button class="btn btn-sm" type="button" @click="openRoot('income')">
            <NavIcon name="plus" :size="13" /> 一级分类
          </button>
        </div>
      </div>
      <div class="card-body tight">
        <div v-if="incomeTree.length === 0" class="empty">还没有收入分类</div>
        <div v-for="node in incomeTree" :key="node.id">
          <div class="list-row">
            <div class="list-main">
              <div class="list-title">{{ node.name }}</div>
              <div class="list-sub">{{ node.children.length }} 个二级分类</div>
            </div>
            <button class="btn btn-link" type="button" @click="openChild(node)">加子类</button>
            <button class="btn btn-link" type="button" @click="openEdit(node)">改名</button>
            <button class="btn btn-link danger" type="button" @click="remove(node)">删除</button>
          </div>
          <div v-for="child in node.children" :key="child.id" class="list-row" style="padding-left: 36px; background: #fcfdfe">
            <div class="list-main">
              <div class="list-title" style="font-weight: 400">{{ child.name }}</div>
            </div>
            <button class="btn btn-link" type="button" @click="openEdit(child)">改名</button>
            <button class="btn btn-link danger" type="button" @click="remove(child)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ModalDialog v-model="showForm" :title="dialogTitle" size="sm">
    <div class="field">
      <label>分类名称 <span class="req">*</span></label>
      <input v-model="form.name" class="input" placeholder="如：餐饮 / 工资" @keyup.enter="submit" />
      <span class="field-hint">
        归属：{{ form.direction === 'expense' ? '支出' : '收入' }}
        <template v-if="form.parent_id"> · 二级分类</template>
        <template v-else> · 一级分类</template>
      </span>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="showForm = false">取消</button>
      <button class="btn btn-primary" type="button" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
