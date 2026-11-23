// 应用入口：先应用备份恢复 -> 初始化数据库 -> 装载设置 -> 挂载界面
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { initDatabase } from './db/database'
import { applyPendingRestore, maybeAutoBackup } from './services/backup'
import { useAppStore } from './stores/app'

async function bootstrap(): Promise<void> {
  const root = document.querySelector('#app')!
  try {
    // 恢复采用“暂存 + 启动时交换”，必须先于数据库初始化执行
    const restored = await applyPendingRestore()
    await initDatabase()

    const app = createApp(App)
    const pinia = createPinia()
    app.use(pinia)
    app.use(router)

    const store = useAppStore(pinia)
    store.loadSettings()
    store.restoredOnBoot = restored
    store.refreshBadges()

    app.mount('#app')

    if (restored) {
      store.showToast('备份数据已恢复')
    } else {
      // 启动时扫描待办并发送汇总通知
      void store.scanTodosAndNotify()
    }

    // 按设定间隔执行自动备份
    await maybeAutoBackup(store.autoBackupEnabled, store.autoBackupHours)
  } catch (error) {
    console.error('[boot] 初始化失败', error)
    root.innerHTML = `
      <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center;font-family:system-ui">
        <div>
          <h2 style="margin-bottom:8px">初始化失败</h2>
          <p style="color:#6b7280;font-size:13px">${String(error)}</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:12px">请刷新页面重试；若仍失败，可能浏览器禁用了 IndexedDB。</p>
        </div>
      </div>`
  }
}

void bootstrap()
