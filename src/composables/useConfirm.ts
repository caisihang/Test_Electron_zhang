// Promise 风格的二次确认，避免各页面重复写弹窗
import { reactive } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState extends Required<ConfirmOptions> {
  visible: boolean
  resolve: ((value: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  visible: false,
  title: '请确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null,
})

/** 弹出确认框，返回用户是否确认 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  // 若已有未决确认，直接拒绝旧的
  state.resolve?.(false)
  state.title = options.title ?? '请确认'
  state.message = options.message
  state.confirmText = options.confirmText ?? '确定'
  state.cancelText = options.cancelText ?? '取消'
  state.danger = options.danger ?? false
  state.visible = true
  return new Promise((resolve) => {
    state.resolve = resolve
  })
}

/** 组件内使用 */
export function useConfirmState(): ConfirmState {
  return state
}

/** 用户选择结果 */
export function settleConfirm(value: boolean): void {
  state.visible = false
  state.resolve?.(value)
  state.resolve = null
}
