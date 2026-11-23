import { createRouter, createWebHistory } from 'vue-router'

// 路由表：与 README 菜单树一一对应（P1 菜单暂不注册）
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { title: '工作台', desc: '钱和待办，一屏看清' },
    },
    {
      path: '/contracts',
      name: 'contracts',
      component: () => import('@/views/contracts/ContractList.vue'),
      meta: { title: '合同台账', desc: '合同是业务源头，计划与流水从这里展开' },
    },
    {
      path: '/contracts/:id',
      name: 'contract-detail',
      component: () => import('@/views/contracts/ContractDetail.vue'),
      meta: { title: '合同详情', desc: '计划、流水、发票、变更、附件' },
    },
    {
      path: '/library',
      name: 'file-library',
      component: () => import('@/views/library/FileLibrary.vue'),
      meta: { title: '合同文件库', desc: '浏览本地文件夹中的合同文件，预览或导入台账' },
    },
    {
      path: '/schedules',
      name: 'schedules',
      component: () => import('@/views/schedules/ScheduleList.vue'),
      meta: { title: '收付款计划', desc: '只看待收待付，逾期与临期一目了然' },
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: () => import('@/views/transactions/TransactionList.vue'),
      meta: { title: '收支流水', desc: '记录每一笔真实收付，可关联合同计划' },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('@/views/accounts/AccountList.vue'),
      meta: { title: '账户管理', desc: '银行卡、微信、支付宝与现金' },
    },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('@/views/categories/CategoryList.vue'),
      meta: { title: '收支分类', desc: '两级分类，按需自定义' },
    },
    {
      path: '/analysis/contracts',
      name: 'analysis-contracts',
      component: () => import('@/views/analysis/ContractExecution.vue'),
      meta: { title: '合同执行表', desc: '合同金额与已执行金额对比' },
    },
    {
      path: '/analysis/income-expense',
      name: 'analysis-income-expense',
      component: () => import('@/views/analysis/IncomeExpense.vue'),
      meta: { title: '收支结余表', desc: '按月汇总收入、支出与结余' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/settings/SettingsPage.vue'),
      meta: { title: '设置', desc: '备份、导出、提醒天数与分类收拢在这里' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
