<!--
=====================================================================
 个人财务 · 文档索引
 本文件包含三部分：
   A. 项目概况与当前实现进度
   B. Tauri 2.0 开发手册（架构 / 数据 / 附件 / 备份 / 命令 / 打包）
   C. 菜单设计规范

 目录定位（搜索关键词）：
   0  文档说明 ............. 「0. 文档说明」
   1  项目概况 ............. 「1. 项目概况」
     1.3 代码目录与索引
   2  当前实现进度 ......... 「2. 当前实现进度」
   3  总体架构 ............. 「3. 总体架构」
   4  数据模型 ............. 「4. 数据模型」
   5  附件管理 ............. 「5. 附件管理」
   6  备份与恢复 ........... 「6. 备份与恢复」
   7  本地提醒 ............. 「7. 本地提醒」
   8  权限与安全 ........... 「8. 权限与安全」
   9  Rust 命令清单 ........ 「9. Rust 命令清单」
   10 项目初始化与配置 ..... 「10. 项目初始化与配置」
   11 打包与发布 ........... 「11. 打包与发布」
   12 菜单设计 ............. 「12. 菜单设计」

 代码入口：
   src/main.ts                  应用启动（恢复 -> 初始化 DB -> 挂载）
   src/db/database.ts           SQLite(sql.js) 初始化、迁移、快照
   src/db/schema.ts             全部迁移 SQL（001~003）
   src/db/repositories/         账户/合同/计划/流水/分类/发票/分析
   src/services/                Tauri 适配、附件、备份、导出、通知
   src/views/                   工作台、合同、计划、流水、账户、分类、分析、设置
=====================================================================
-->

# 个人财务 · 开发手册

> 纯本地个人财务软件，单用户、无云端、无账号体系。
> 前端 Vue 3 + TypeScript + Vite，桌面壳 Rust + Tauri 2.x，数据 SQLite。

- 版本基线：Tauri 2.x stable
- 目标平台：Windows 优先（NSIS 安装包），macOS / Linux 可后续适配
- 当前状态：P0 全量功能已完成，可用 Web 预览模式运行；Tauri 原生壳（`src-tauri`）待接入

---

## 目录

- [0. 文档说明](#0-文档说明)
- [1. 项目概况](#1-项目概况)
  - [1.1 基本定位](#11-基本定位)
  - [1.2 前端框架选择](#12-前端框架选择)
  - [1.3 代码目录与索引](#13-代码目录与索引)
- [2. 当前实现进度](#2-当前实现进度)
  - [2.1 交付形态](#21-交付形态)
  - [2.2 快速开始](#22-快速开始)
  - [2.3 模块状态](#23-模块状态)
  - [2.4 与原生手册的差异](#24-与原生手册的差异)
  - [2.5 验证记录](#25-验证记录)
  - [2.6 待办](#26-待办)
- [3. 总体架构](#3-总体架构)
  - [3.1 分层架构](#31-分层架构)
  - [3.2 纯本地约束](#32-纯本地约束)
  - [3.3 业务规则与金额口径](#33-业务规则与金额口径)
- [4. 数据模型](#4-数据模型)
  - [4.1 表结构](#41-表结构)
  - [4.2 设计说明](#42-设计说明)
  - [4.3 核销逻辑](#43-核销逻辑)
  - [4.4 数据库迁移](#44-数据库迁移)
- [5. 附件管理](#5-附件管理)
- [6. 备份与恢复](#6-备份与恢复)
- [7. 本地提醒](#7-本地提醒)
- [8. 权限与安全](#8-权限与安全)
- [9. Rust 命令清单](#9-rust-命令清单)
- [10. 项目初始化与配置](#10-项目初始化与配置)
- [11. 打包与发布](#11-打包与发布)
- [12. 菜单设计](#12-菜单设计)

---

## 0. 文档说明

本文件是**开发手册 + 实现记录**二合一：

- 第 1~2 章面向使用与验收：项目是什么、现在做到哪、怎么跑起来。
- 第 3~11 章是 Tauri 原生实现的完整方案：架构、数据模型、附件、备份、提醒、权限、命令清单、脚手架与打包。这些内容既是设计依据，也是后续接入 Rust 壳时的施工单。
- 第 12 章是菜单设计规范，与前端实际菜单一一对应。

当前仓库处于「Web 优先」阶段：先保证业务逻辑与页面在浏览器里跑通，再按手册把数据层/文件层替换为 Tauri 原生能力。凡是「Web 实现」与「Tauri 实现」不同的地方，都在对应章节标注了。

---

## 1. 项目概况

### 1.1 基本定位

| 项目 | 说明 |
| --- | --- |
| 产品定位 | 单用户、纯本地、无云端、无账号体系 |
| 前端 | Vue 3 + TypeScript + Vite（SPA） |
| 桌面壳 | Rust + Tauri 2.x |
| 数据库 | SQLite（原生用 `tauri-plugin-sql`；Web 预览用 sql.js / WASM） |
| 备份 | zip 包（`manifest.json` + `finance.db` + `attachments/`），可选 SQLCipher 加密 |
| 目标平台 | Windows 优先（NSIS），macOS / Linux 后续适配 |
| 数据目录 | `app_data_dir/`，由 Tauri 动态解析，禁止硬编码 |

### 1.2 前端框架选择

Tauri 对前端框架无感知，Vite 是 SPA 的推荐构建工具。个人财务软件页面数量中等（10~20 个视图），Vue 3 的响应式 + 组合式 API 足够，且 Tauri 生态中 Vue 示例较多。若更看重 TypeScript 类型安全，React + TS 同样可行。

不建议使用 Next.js / Nuxt 等 SSR 框架：纯本地 SPA 不需要服务端渲染，反而增加配置负担。

### 1.3 代码目录与索引

路径别名 `@` 指向 `src/`（见 `vite.config.ts`）。目录结构：

```text
Test_Electron_zhang/
├── index.html                  应用入口 HTML（挂载 #app）
├── package.json                依赖与脚本（dev / build / preview / tauri）
├── vite.config.ts              Vite 配置：端口 1420、别名 @、构建目标
├── tsconfig.json               TS 工程引用入口
├── tsconfig.app.json           应用侧 TS 配置（strict、@/* 路径）
├── tsconfig.node.json          Vite 配置文件用 TS 配置
├── README.md                   本文档
├── src-tauri/                  Tauri 2 原生壳（Rust）
│   ├── Cargo.toml              依赖：tauri 2.12（protocol-asset）/ dialog / walkdir / log
│   ├── build.rs                构建脚本
│   ├── tauri.conf.json         窗口、CSP（含 asset 协议）、NSIS 打包配置
│   ├── capabilities/default.json  权限：core + dialog
│   ├── icons/                  应用图标（含 icon.ico）
│   └── src/
│       ├── main.rs             桌面入口
│       ├── lib.rs              Builder：注册插件与命令
│       └── commands.rs         11 个命令：DB 读写、目录扫描、附件导入/解析/删除/列出/备份读写/清空、系统打开
└── src/
    ├── main.ts                 启动引导：恢复 -> 初始化 DB -> 挂载 -> 通知/自动备份
    ├── App.vue                 根组件（路由出口 + 全局确认框/提示）
    ├── env.d.ts                .vue 与 wasm?url 的类型声明
    ├── db/                     数据层
    │   ├── idb.ts              IndexedDB 封装（kv / files / backups / staging）
    │   ├── schema.ts           全部迁移 SQL（001 core / 002 invoices / 003 settings / 004 contract_files）
    │   ├── database.ts         sql.js 初始化、迁移执行、查询、持久化、种子数据
    │   └── repositories/       按业务拆分的仓储（SQL 只出现在这一层）
    │       ├── accounts.ts     账户：列表（含实时余额）、增改、归档
    │       ├── contracts.ts    合同：筛选、增改、软删除、变更留痕、执行进度
    │       ├── schedules.ts    计划：生成、增改删、状态重算、核销匹配与确认
    │       ├── transactions.ts 流水：筛选、增改、软删除、凭证、可核销计划
    │       ├── categories.ts   分类：两级树、增改、删除保护
    │       ├── invoices.ts     发票：普票/专票、已开/未开、汇总与合同开票进度
    │       ├── contractFiles.ts 合同文件索引：文件库导入记录、按合同/关键字检索
    │       └── analysis.ts     分析：工作台汇总、合同执行表、月度/分类统计
    ├── services/               与外部资源交互（可切 Tauri）
    │   ├── tauri.ts            运行时探测与 invoke/convertFileSrc 适配层
    │   ├── folder.ts           文件夹选择、目录扫描、本地文件预览地址（桌面端）
    │   ├── attachment.ts       附件导入、读取、预览、删除（相对路径规则）
    │   ├── backup.ts           备份打包、列表、下载、暂存恢复、自动备份
    │   ├── exporter.ts         Excel 导出（合同 / 流水 / 计划）
    │   └── notifier.ts         系统通知与权限申请
    ├── stores/
    │   └── app.ts              全局状态：设置、徽标计数、恢复提示、Toast
    ├── router/
    │   └── index.ts            路由表（meta 带页面标题与说明）
    ├── layouts/
    │   └── AppLayout.vue       侧边栏 + 顶栏骨架、菜单分组与徽标、P1 开关
    ├── components/
    │   ├── ModalDialog.vue     通用弹窗
    │   ├── ConfirmHost.vue     全局确认框宿主
    │   ├── NavIcon.vue         内联 SVG 图标
    │   ├── FilePreviewModal.vue 文件预览：图片 / PDF / 文本，其他转系统打开
    │   └── ContractFormModal.vue 合同新建/编辑表单
    ├── composables/
    │   └── useConfirm.ts       Promise 化确认框
    ├── views/                  页面
    │   ├── Dashboard.vue       工作台
    │   ├── contracts/          ContractList / ContractDetail（5 Tab）
    │   ├── schedules/          ScheduleList
    │   ├── transactions/       TransactionList（记账 + 核销）
    │   ├── library/            FileLibrary（文件夹浏览、预览、导入台账）
    │   ├── invoices/           InvoiceList（发票管理）
    │   ├── accounts/           AccountList
    │   ├── categories/         CategoryList
    │   ├── analysis/           ContractExecution / IncomeExpense
    │   └── settings/           SettingsPage（常规 / 备份 / 导入导出 / 关于）
    ├── types/
    │   └── models.ts           全部实体与行视图类型、状态联合类型
    ├── utils/
    │   └── format.ts           金额/日期/百分比格式化、中文枚举、日期计算
    └── styles/
        └── main.css            设计系统：布局、卡片、表格、表单、标签、弹窗
```

调用方向（单向依赖，避免循环）：

```text
views / components  →  stores / services / repositories  →  db/database  →  sql.js + IndexedDB
```

- 页面只调 `repositories` 取数、调 `services` 处理文件与备份，不直接写 SQL。
- `repositories` 只依赖 `db/database.ts`，不感知 Vue。
- `services` 通过 `tauri.ts` 判断运行环境：Web 用 IndexedDB / SheetJS / Notification API，Tauri 下走 `invoke`。
- 文件库与目录扫描依赖 Rust 命令（`src-tauri/src/commands.rs`），仅在桌面端可用；浏览器预览会提示不可用。

常用改动入口：

| 想改什么 | 从哪里入手 |
| --- | --- |
| 新增字段 / 表 | `src/db/schema.ts` 追加迁移 → `src/types/models.ts` → 对应 repository |
| 新增页面 | `src/views/` 建组件 → `src/router/index.ts` 注册 → `AppLayout.vue` 菜单 |
| 调整菜单/徽标 | `src/layouts/AppLayout.vue`、`src/stores/app.ts` |
| 改金额或状态口径 | 对应 repository（如 `schedules.ts` 的 `recalcSchedule`）+ `analysis.ts` |
| 接 Tauri | `src/services/` 内按 `isTauri()` 增加分支，页面无需改动 |
| 调整全局样式 | `src/styles/main.css`（CSS 变量集中在文件顶部） |

---

## 2. 当前实现进度

### 2.1 交付形态

P0 全量功能已实现并在浏览器中跑通。当前技术底座：

- **运行时**：Vue 3 + TypeScript(strict) + Vite，开发端口 `1420`（与 Tauri `devUrl` 一致）
- **数据层**：SQLite（sql.js / WASM）执行与手册一致的建表 SQL，快照持久化到 IndexedDB
- **附件**：文件实体以 Blob 存入 IndexedDB，数据库只存相对路径
- **原生壳**：`src-tauri` 脚手架已生成（Tauri 2.12，NSIS 打包配置就绪），前端 Tauri 适配层已预留。本机缺少 Rust 与 MSVC，暂不能编译；装好工具链后即可 `npm run tauri build`。

### 2.2 快速开始

```bash
npm install

npm run dev        # http://localhost:1420
npm run build      # vue-tsc 类型检查 + 生产构建
npm run preview    # 预览构建产物

npm run tauri dev    # 桌面端调试（需 Rust + MSVC + WebView2）
npm run tauri build  # 打包 NSIS 安装包，产物在 src-tauri/target/release/bundle/nsis/
```

### 2.3 模块状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 工作台 | 已完成 | 本月收支、应收应付、账户余额、待办计划、最近流水、快捷入口 |
| 合同台账 | 已完成 | 搜索 / 方向 / 状态筛选、新建 / 编辑、软删除、变更留痕、单文件上传并导入台账 |
| 合同文件库 | 已完成 | 选择本地文件夹、资源管理器式层级浏览（面包屑 + 子目录 + 当前层文件）、单文件上传、搜索 / 类型筛选、预览、顶部批量导入条（跨层级累积勾选） |
| 已导入台账 | 已完成 | 合同文件库中被纳入台账的文件，按合同分组展示、可预览、可移除索引 |
| 合同详情（5 Tab） | 已完成 | 计划、流水、发票、变更、附件；含 30/50/20 按比例生成计划；桌面端附件走原生对话框 |
| 收付款计划 | 已完成 | 未结清 / 逾期 / 已结清筛选、逾期统计、新增与编辑、一键去记账 |
| 收支流水 | 已完成 | 筛选、记账、关联合同 / 计划、凭证上传、核销（推荐匹配 + 人工确认） |
| 账户管理 | 已完成 | 初始余额、实时余额、归档 / 启用 |
| 收支分类 | 已完成 | 两级分类维护、被引用与含子类时的删除保护 |
| 分析 · 合同执行表 | 已完成 | 合同金额 / 计划合计 / 实际收付 / 计划完成 / 执行率 |
| 分析 · 收支结余表 | 已完成 | 12 个月收支与结余、月度柱状图、分类 Top 8 |
| 设置 · 常规 | 已完成 | 提醒天数、启动通知、自动备份间隔、运行环境说明 |
| 设置 · 备份与恢复 | 已完成 | 手动 / 自动备份、下载、导入 zip、暂存恢复 + 重启生效 |
| 设置 · 导入导出 | 已完成 | 合同 / 流水 / 计划 / 发票 Excel 导出，完整备份包导出；桌面端弹系统「另存为」选目录 |
| 发票管理 | 已完成 | 一级菜单；普票 / 专票、已开 / 未开、按合同核对已开票与未开余额、导出 Excel |
| 发票（合同内） | 已完成 | 与一级菜单共用数据，Tab 顶部显示已开票 / 未开余额 / 开票进度 |
| 回收站 | 未开始 | P1：软删除数据已在库中保留，恢复界面待做 |
| 应收应付表 | 未开始 | P1：当前由工作台应收 / 应付卡片与计划页覆盖 |
| Tauri 壳 | 已完成 | Rust 1.100 + MSVC 环境就绪，`npm run tauri build` 可产出 NSIS 安装包 |
| Rust 命令层 | 已完成（本期范围） | 9 个命令：扫描目录 / 文件元信息 / 读字节 / 导入 / 解析 / 删除 / 列出附件 / 系统打开 / 写入导出文件；备份打包与通知由前端插件承担 |

### 2.4 与原生手册的差异

Web 预览模式下，部分能力用等价方案替代，接口保持不变，接 Tauri 后无需改页面：

1. **数据访问**：用 sql.js 执行与手册一致的建表 SQL，全部语句集中在 `src/db/schema.ts`，迁移按 `PRAGMA user_version` 执行；桌面端快照写入 exe 同目录 `data/finance.db`（浏览器预览回退 IndexedDB），未迁移到 `tauri-plugin-sql`。
2. **附件**：数据库只存相对路径（`contract/{id}/xxx`、`transaction/{id}/xxx`）。桌面端由 Rust 的 `import_attachment` / `resolve_attachment_path` / `list_attachments` 读写 `data/attachments/`；浏览器预览仍用 IndexedDB。文件库导入会同步写入 `contract_files` 索引表。
3. **恢复**：严格执行「暂存 + 下次启动交换」。备份包 = `manifest.json` + `finance.db` + `attachments/`，恢复后需刷新（重启）页面。
4. **Excel**：Web 预览用 SheetJS 生成下载；Tauri 下改为 Rust 的 `rust_xlsxwriter` + 保存对话框。
5. **提醒**：启动时扫描 + 系统通知汇总，不做后台常驻推送；桌面端由 `@tauri-apps/plugin-notification` 发送（WebView2 不支持浏览器 Notification），浏览器预览仍走 Web API。
6. **金额口径**：应收 / 应付 = 未结清计划的剩余金额；执行率 = 实际收付 / 合同金额；收支结余只统计真实流水。
7. **数据位置**：桌面端数据库快照写 exe 同目录 `data/finance.db`（临时文件 + `.bak` 原子替换），附件在 `data/attachments/`；目录不可写时自动回退 `%APPDATA%/{identifier}/data`。首次启动会把旧 IndexedDB 快照迁移到文件，旧数据不丢。

### 2.5 验证记录

2026-11-23，浏览器 1420 端口：

1. 首次启动自动建库与默认账户 / 分类初始化，无控制台错误。
2. 新建合同 100,000 → 按比例生成 3 期计划（30,000 / 50,000 / 20,000），计划合计与合同金额一致。
3. 记一笔 30,000 收入并核销预付款：计划变为已结清，合同执行进度 30.0%，计划完成 1/3。
4. 工作台本月收入 30,000、应收 70,000；收支结余表全年收入 30,000 且柱状图正常；合同执行表执行率 30.0%。
5. 立即备份生成 zip（手动），刷新页面后数据完整保留，提醒天数默认 3 生效。
6. `npm run build` 通过（`vue-tsc` 无错误）。
7. Tauri 环境（Rust 1.100 + MSVC）就绪后 `cargo check` 通过，命令层无编译错误。
8. `npm run tauri build` 通过：release 编译 5m05s，产物 `personal-finance.exe` 3.77 MB、NSIS 安装包 `个人财务_0.1.0_x64-setup.exe` 1.71 MB。
9. 合同文件库的实机交互（选目录、预览、导入）尚待在 `npm run tauri dev` 下验证。
10. 数据目录改为 exe 同目录 `data/`：`cargo check` 与 `npm run build` 通过；备份包已同步支持桌面端附件的写入与恢复。实机启动验证需手动执行（本机自动化环境无法启动 GUI）。
11. NSIS 安装向导改为简体中文（`languages: ["SimpChinese"]`），生成脚本含 `MUI_LANGUAGE "SimpChinese"`。
12. 通知改用 `tauri-plugin-notification`：原 `notify_pending` 命令从未在 Rust 注册、WebView2 也不支持浏览器 Notification，是「发送测试通知」失败的根因；现由前端直接调用插件，`cargo check` 与前端构建通过。
13. 桌面端 Excel / 备份导出改为原生「另存为」对话框 + `write_file_bytes` 命令写入（WebView2 无下载管理器，原 `<a download>` 无反应）。
14. 收付款计划到期日改为可空（迁移 005 重建表）；空日期不参与逾期判定，所有计划表单统一放开。
15. 发票增加 `invoice_type`（普票/专票）与 `issue_status`（已开/未开），迁移 006 自动把有开票日期的历史记录标记为已开；新增发票管理页、工作台「待开票」卡片与合同详情开票进度。
16. 合同文件库与合同台账增加单文件上传：原生文件对话框选择后经 `stat_files` 读取元信息并授权预览，复用「新建合同 / 挂到已有合同」导入弹窗。

### 2.6 待办

按优先级：

1. 用 `npm run tauri dev` 在 Windows 实机验证：选择文件夹、递归扫描、图片 / PDF 预览、导入台账（新建合同 / 挂到已有）。
2. 备份打包前端完成 zip、写入走原生「另存为」+ Rust；如后续需要超大备份包，可改为 Rust 侧流式打包。
3. 数据层如需进一步迁移到 `tauri-plugin-sql`（需把所有仓储改为异步），再单独评估；当前文件快照方案已满足本地存储需求。
4. P1：回收站界面、应收应付表。
5. 打包：安装包首次运行说明与版本号规范。

---

## 3. 总体架构

### 3.1 分层架构

```text
┌─────────────────────────────────────────────┐
│  前端（Vue 3 + TS + Vite）                    │
│  页面 / 组件 / 状态（Pinia 可选）/ 路由       │
│  invoke() 调用 Rust 命令，不直接碰文件系统/DB  │
└──────────────────┬──────────────────────────┘
                   │ IPC（invoke / event）
┌──────────────────▼──────────────────────────┐
│  Rust 层（src-tauri）                         │
│  #[tauri::command] 业务命令                   │
│  附件归档 / 备份打包 / 通知 / 文件对话框      │
│  tauri-plugin-sql（SQLite 连接 + 迁移）       │
│  tauri-plugin-fs（受控路径访问）              │
│  tauri-plugin-dialog（文件选择）              │
│  tauri-plugin-notification（系统通知）        │
│  tauri-plugin-opener（打开附件/文件夹）        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  本地存储                                     │
│  app_data_dir/                               │
│  ├── finance.db        （SQLite）            │
│  ├── attachments/      （附件，按业务ID分目录）│
│  └── backups/          （自动备份 zip）       │
└─────────────────────────────────────────────┘
```

核心原则：前端不直接读写文件系统和数据库。所有附件路径、备份路径、SQL 执行都通过 Rust 命令完成，或至少经过 Rust 层的路径解析与权限约束。

### 3.2 纯本地约束

| 决策 | 做法 |
| --- | --- |
| 无账号、无网络 | 不集成任何 HTTP 客户端、不请求远程 API、不做自动更新联网检查（更新由用户手动下载安装包覆盖安装） |
| 数据库位置 | 必须通过 `app.path().app_data_dir()` 动态获取，绝不硬编码；打包后硬编码路径必然失效 |
| 附件路径 | 数据库只存相对于 `app_data_dir/attachments/` 的相对路径，换电脑 / 迁移目录后附件仍可解析 |
| 备份恢复 | 恢复操作采用「暂存 + 下次启动时交换」策略，避免恢复过程中数据库被占用导致损坏 |
| 操作日志 | 不做全量日志；用「回收站（软删除）+ 删除确认 + 自动备份」替代 |
| 通知 | 只做启动时扫描 + 首页待办 + 系统通知，不承诺后台实时推送 |

> Windows 上 `notification` 插件只在安装后的应用中生效，开发模式下会显示 PowerShell 名称与图标，属预期行为。

### 3.3 业务规则与金额口径

- **应收 / 应付** = 未结清计划（`pending` / `partial` / `overdue`）的剩余金额之和。
- **执行率** = 实际收付金额 / 合同金额。
- **收支结余**只统计真实流水，不计计划。
- **计划状态**由关联流水汇总推导：无流水为 `pending`，部分收付为 `partial`，付满为 `settled`，超期未结清为 `overdue`。
- **合同变更**只记录金额、日期等关键字段，不回写已执行计划，仅影响 `pending` 计划或由用户手动新增计划。

---

## 4. 数据模型

### 4.1 表结构

```sql
-- 1. 账户
CREATE TABLE accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,                 -- 招商银行卡 / 微信 / 支付宝 / 现金
    account_type  TEXT NOT NULL DEFAULT 'bank',  -- bank / wechat / alipay / cash
    initial_balance REAL NOT NULL DEFAULT 0,     -- 初始余额
    currency      TEXT NOT NULL DEFAULT 'CNY',
    is_archived   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 2. 合同
CREATE TABLE contracts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_no     TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    counterparty    TEXT NOT NULL,
    sign_date       TEXT,
    start_date      TEXT,
    end_date        TEXT,
    total_amount    REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','completed','terminated')),
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_at      TEXT                         -- 软删除，NULL 表示未删除
);

-- 3. 收付款计划
CREATE TABLE schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id),
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    label           TEXT,                        -- 预付款 / 进度款 / 尾款 / 质保金
    due_date        TEXT NOT NULL,
    planned_amount  REAL NOT NULL,
    actual_amount   REAL NOT NULL DEFAULT 0,     -- 冗余字段，由流水关联后汇总更新
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','settled','overdue')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 4. 流水（实际收付）
CREATE TABLE transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL REFERENCES accounts(id),
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    amount          REAL NOT NULL,
    txn_date        TEXT NOT NULL,
    category_l1     TEXT,                        -- 一级分类
    category_l2     TEXT,                        -- 二级分类
    contract_id     INTEGER REFERENCES contracts(id),   -- 可为空（零星收支）
    schedule_id     INTEGER REFERENCES schedules(id),   -- 可为空
    counterparty    TEXT,
    note            TEXT,
    voucher_path    TEXT,                        -- 凭证附件的相对路径
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_at      TEXT
);

-- 5. 合同变更历史
CREATE TABLE contract_changes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id),
    field_name      TEXT NOT NULL,               -- total_amount / end_date / other
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    changed_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 6. 发票（轻量）
CREATE TABLE invoices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no      TEXT,
    direction       TEXT NOT NULL CHECK (direction IN ('issued','received')), -- 开票/收票
    amount          REAL NOT NULL,
    tax_rate        REAL DEFAULT 0,
    invoice_date    TEXT,
    contract_id     INTEGER REFERENCES contracts(id),
    transaction_id  INTEGER REFERENCES transactions(id),
    status          TEXT DEFAULT 'normal',       -- normal / missing_payment / missing_invoice
    attachment_path TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 7. 分类（用户可自定义）
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER REFERENCES categories(id), -- NULL 表示一级
    name        TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
    sort_order  INTEGER DEFAULT 0
);

-- 8. 回收站
-- 所有业务表使用 deleted_at 软删除，前端提供「回收站」页面恢复或彻底删除
```

### 4.2 设计说明

- `schedules.actual_amount` 是冗余汇总字段。每次流水核销 / 取消核销后，重新计算并更新对应计划的 `actual_amount` 与 `status`，避免前端做复杂聚合。
- `transactions.schedule_id` 允许为空。个人版核销以「一笔流水关联一期计划」为主；部分收款由用户手动拆成多笔流水分别关联，不做多对多自动分摊。
- `contract_changes` 只记录金额和日期等关键字段的变更，变更后不自动改写已执行计划。

### 4.3 核销逻辑

推荐匹配 + 人工确认。以下是接入 Tauri 后的参考实现（Rust），当前 Web 实现见 `src/db/repositories/schedules.ts`。

```rust
// src-tauri/src/commands/reconcile.rs

#[derive(serde::Serialize)]
struct ReconcileCandidate {
    schedule_id: i64,
    contract_title: String,
    label: Option<String>,
    due_date: String,
    planned_amount: f64,
    remaining: f64,
    score: f64,
}

#[tauri::command]
pub async fn find_reconcile_candidates(
    db: tauri::State<'_, DbPool>,
    transaction_id: i64,
) -> Result<Vec<ReconcileCandidate>, String> {
    // 1. 读取流水
    let txn = sqlx::query_as::<_, Transaction>(
        "SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL"
    ).bind(transaction_id).fetch_one(&*db).await.map_err(|e| e.to_string())?;

    if txn.contract_id.is_none() {
        return Ok(vec![]); // 零星收支不推荐
    }

    // 2. 查找同合同、同方向、未结清的计划
    let rows = sqlx::query_as::<_, Schedule>(
        "SELECT * FROM schedules
         WHERE contract_id = ? AND direction = ? AND status IN ('pending','partial','overdue')
         ORDER BY due_date ASC"
    ).bind(txn.contract_id).bind(&txn.direction).fetch_all(&*db).await.map_err(|e| e.to_string())?;

    // 3. 简单评分：金额越接近分数越高；仅作为排序参考
    let mut candidates: Vec<ReconcileCandidate> = rows.into_iter().map(|s| {
        let remaining = s.planned_amount - s.actual_amount;
        let amount_score = 1.0 - ((remaining - txn.amount).abs() / remaining.max(1.0));
        ReconcileCandidate {
            schedule_id: s.id,
            contract_title: String::new(), // 需 join 合同表获取，略
            label: s.label,
            due_date: s.due_date,
            planned_amount: s.planned_amount,
            remaining,
            score: amount_score,
        }
    }).collect();

    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(candidates)
}

#[tauri::command]
pub async fn confirm_reconcile(
    db: tauri::State<'_, DbPool>,
    transaction_id: i64,
    schedule_id: i64,
) -> Result<(), String> {
    let mut tx = db.begin().await.map_err(|e| e.to_string())?;

    // 1. 更新流水关联
    sqlx::query("UPDATE transactions SET schedule_id = ? WHERE id = ?")
        .bind(schedule_id).bind(transaction_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // 2. 重新计算该计划的 actual_amount 和 status
    let total: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount),0) FROM transactions
         WHERE schedule_id = ? AND deleted_at IS NULL"
    ).bind(schedule_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let planned: f64 = sqlx::query_scalar("SELECT planned_amount FROM schedules WHERE id = ?")
        .bind(schedule_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let status = if total >= planned - 0.01 {
        "settled"
    } else if total > 0.0 {
        "partial"
    } else {
        "pending"
    };

    sqlx::query("UPDATE schedules SET actual_amount = ?, status = ? WHERE id = ?")
        .bind(total).bind(status).bind(schedule_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
```

取消核销：将 `transactions.schedule_id` 置回 `NULL`，再执行一次上述汇总重算。

### 4.4 数据库迁移

原生模式使用 `tauri-plugin-sql` 的 `Migration` 结构体，在插件初始化时注册；Web 模式在 `src/db/schema.ts` 维护同样的 SQL，按 `PRAGMA user_version` 顺序执行。

```rust
// src-tauri/src/lib.rs

use tauri_plugin_sql::{Builder, Migration, MigrationKind};

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_core_tables",
            sql: include_str!("../migrations/001_core.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_invoices",
            sql: include_str!("../migrations/002_invoices.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations("sqlite:finance.db", migrations)
                .build()
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 这里注册所有命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

迁移编写要点：

- 版本号唯一且递增；
- 幂等：使用 `CREATE TABLE IF NOT EXISTS`；`ALTER TABLE ... ADD COLUMN` 需注意重复执行安全性；
- 迁移 SQL 放在独立 `.sql` 文件中，通过 `include_str!` 引入，便于维护和审阅。

---

## 5. 附件管理

### 5.1 存储约定

```text
app_data_dir/
└── attachments/
    ├── contract/{contract_id}/{uuid}.pdf
    ├── transaction/{transaction_id}/{uuid}.png
    └── invoice/{invoice_id}/{uuid}.jpg
```

数据库存储相对 `attachments/` 的路径，例如 `contract/12/a1b2c3.pdf`。**禁止存储绝对路径**，否则迁移数据目录后全部失效。

> Web 预览模式：路径规则完全一致，文件实体存于 IndexedDB。

### 5.2 附件导入（Rust 命令）

```rust
// src-tauri/src/commands/attachment.rs
use std::path::{Path, PathBuf};
use tauri::Manager;

#[tauri::command]
pub async fn import_attachment(
    app: tauri::AppHandle,
    source_path: String,
    biz_type: String,      // "contract" | "transaction" | "invoice"
    biz_id: i64,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let attach_root = app_data.join("attachments").join(&biz_type).join(biz_id.to_string());
    std::fs::create_dir_all(&attach_root).map_err(|e| e.to_string())?;

    let src = PathBuf::from(&source_path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("bin");
    let file_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = attach_root.join(&file_name);

    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;

    // 返回相对路径
    Ok(format!("{}/{}/{}", biz_type, biz_id, file_name))
}

#[tauri::command]
pub async fn resolve_attachment_path(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let full = app_data.join("attachments").join(&relative_path);
    Ok(full.to_string_lossy().to_string())
}
```

### 5.3 附件预览

- **PDF / 图片**：前端用 `convertFileSrc()` 将绝对路径转为 `asset://` 协议 URL，在 `<iframe>` 或 `<img>` 中预览。
- **Word / 其他格式**：不内置预览，通过 `tauri-plugin-opener` 调用系统默认程序打开。

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';

// 预览图片/PDF
const absPath = await invoke<string>('resolve_attachment_path', { relativePath: 'contract/12/a1b2.pdf' });
const url = convertFileSrc(absPath);
// <iframe :src="url" /> 或 <img :src="url" />

// 打开 Word
await openPath(absPath);
```

---

## 6. 备份与恢复

### 6.1 备份包结构

```text
finance-backup-2026-11-23-1030.zip
├── manifest.json          # 版本号、schema 版本、文件校验和、创建时间
├── finance.db             # 数据库快照
└── attachments/           # 附件目录完整拷贝
```

### 6.2 打包（纯 Rust）

```toml
# Cargo.toml
zip = "2"
sha2 = "0.10"
```

```rust
use std::io::{Read, Write};
use zip::write::FileOptions;

#[tauri::command]
pub async fn create_backup(
    app: tauri::AppHandle,
    dest_path: String,
) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data.join("finance.db");

    // 1. 使用 VACUUM INTO 生成一致性快照（避免直接拷贝正在写入的 db）
    let snapshot_path = app_data.join("finance_snapshot.db");
    // 通过 sqlx 执行: VACUUM INTO '...snapshot_path...'（略）

    let file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 2. 写入 manifest（简化：先写占位，实际项目中计算 sha256）
    zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
    zip.write_all(br#"{"version":1,"schema_version":2}"#).map_err(|e| e.to_string())?;

    // 3. 写入数据库快照
    zip.start_file("finance.db", options).map_err(|e| e.to_string())?;
    let mut f = std::fs::File::open(&snapshot_path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    zip.write_all(&buf).map_err(|e| e.to_string())?;

    // 4. 递归写入 attachments
    let attach_root = app_data.join("attachments");
    if attach_root.exists() {
        add_dir_to_zip(&mut zip, &attach_root, "attachments", options)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&snapshot_path); // 清理临时快照
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    dir: &Path,
    prefix: &str,
    options: FileOptions,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = format!("{}/{}", prefix, entry.file_name().to_string_lossy());
        if path.is_dir() {
            add_dir_to_zip(zip, &path, &name, options)?;
        } else {
            zip.start_file(&name, options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

### 6.3 恢复策略

采用「暂存 + 下次启动交换」，避免在应用运行中直接覆盖正在使用的数据库和附件目录。

```rust
#[tauri::command]
pub async fn stage_restore(
    app: tauri::AppHandle,
    backup_zip_path: String,
) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let staging = app_data.join("_restore_staging");

    // 清理旧 staging
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    // 解压 zip 到 staging
    let file = std::fs::File::open(&backup_zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&staging).map_err(|e| e.to_string())?;

    // 写入标记文件，应用下次启动时检测并执行交换
    std::fs::write(staging.join(".restore_pending"), "1").map_err(|e| e.to_string())?;

    Ok(())
}
```

应用启动时，在打开数据库和任何附件之前，检测 `_restore_staging/.restore_pending`；若存在则备份当前数据、替换 `finance.db` 和 `attachments`，最后删除 staging 与标记文件。

> Web 预览模式：备份包由 JSZip 生成，Blob 存 IndexedDB；恢复写入 `staging` 存储区，下次启动时执行交换。

### 6.4 自动备份

在 `app_data_dir/backups/` 下保留最近 N 份自动备份。触发时机：每次应用启动时（距上次备份超过设定间隔，如 24 小时）或用户退出前（可选）。不依赖后台常驻进程。

---

## 7. 本地提醒

### 7.1 策略

不承诺实时后台推送。提醒在应用启动时和首页工作台渲染时生成：

1. 查询逾期计划（`due_date < today` 且 `status != 'settled'`）；
2. 查询临期计划（`due_date` 在 `today` 到 `today + N` 天之间，N 默认 3）；
3. 在首页以「待办清单」展示；
4. 可选：调用 `tauri-plugin-notification` 发送一条汇总通知。

### 7.2 通知发送（前端直接调用插件）

不自定义 Rust 命令，前端通过 `@tauri-apps/plugin-notification` 发送；WebView2 不支持浏览器 `Notification` 权限，因此桌面端不能走 Web API。

```ts
// src/services/notifier.ts
import { isPermissionGranted, requestPermission, sendNotification }
  from '@tauri-apps/plugin-notification'

if (await isPermissionGranted()) {
  sendNotification({ title: '今日财务待办', body: `${count} 项需要处理：${detail}` })
}
```

Rust 侧只需注册插件与授权：

```rust
// lib.rs
.plugin(tauri_plugin_notification::init())
```

```json
// capabilities/default.json
"permissions": ["core:default", "dialog:default", "notification:default"]
```

Windows 上通知仅在安装后的应用中生效，开发模式下显示 PowerShell 名称与图标，属预期行为。

---

## 8. 权限与安全

Tauri 2 默认阻止所有潜在危险命令，必须在 `src-tauri/capabilities/default.json` 中显式启用。

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "纯本地个人财务所需的最小权限",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-execute",
    "sql:allow-select",
    "fs:default",
    "fs:allow-appdata-read-recursive",
    "fs:allow-appdata-write-recursive",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "notification:default",
    "opener:default",
    "opener:allow-open-path"
  ]
}
```

原则：只开启实际用到的命令。`fs` 权限尽量限制在 appdata 范围内，不要开放整个文件系统；用不到的命令不要加权限。

---

## 9. Rust 命令清单

建议在 `src-tauri/src/commands/` 下按业务拆分文件，在 `lib.rs` 中统一注册：

| 命令 | 用途 |
| --- | --- |
| `list_accounts` / `create_account` / `update_account` | 账户管理 |
| `list_contracts` / `create_contract` / `update_contract` / `soft_delete_contract` | 合同台账 |
| `generate_schedules` / `list_schedules` / `update_schedule` | 计划生成与调整 |
| `create_transaction` / `list_transactions` / `soft_delete_transaction` | 流水记账 |
| `find_reconcile_candidates` / `confirm_reconcile` / `cancel_reconcile` | 核销 |
| `import_attachment` / `resolve_attachment_path` | 附件 |
| `create_backup` / `stage_restore` / `list_backups` | 备份恢复 |
| `notify_pending`（未使用） | 本地通知改由前端调用 notification 插件发送，见 7.2 |
| `get_dashboard_summary` | 首页指标（本月收支结余、应收应付、账户余额） |
| `export_contracts_xlsx` / `export_transactions_xlsx` | Excel 导出 |

Excel 导出建议使用 Rust 的 `rust_xlsxwriter` 或 `umya-spreadsheet`，在 Rust 端生成 `.xlsx` 并通过保存对话框写入用户选择的位置；避免前端用 SheetJS 处理大文件导致内存压力。

---

## 10. 项目初始化与配置

### 10.1 创建项目

```bash
# 使用 create-tauri-app
npm create tauri-app@latest personal-finance

# 选项：
# 前端语言：TypeScript
# 包管理器：pnpm / npm
# UI 模板：Vue
# 是否使用 TypeScript：Yes

cd personal-finance
pnpm install
pnpm tauri dev
```

### 10.2 安装 Tauri 插件

```bash
# Rust 端（在 src-tauri 目录下）
cd src-tauri

# SQLite 插件（含 SQLite 驱动）
cargo tauri plugin add sql
# 或手动在 Cargo.toml 中添加
# tauri-plugin-sql = { version = "2", features = ["sqlite"] }

# 文件系统
cargo tauri plugin add fs

# 对话框（选择备份路径、选择附件文件）
cargo tauri plugin add dialog

# 系统通知
cargo tauri plugin add notification

# 打开附件/文件夹
cargo tauri plugin add opener
```

```bash
# 前端（在项目根目录）
pnpm add @tauri-apps/plugin-sql @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-notification @tauri-apps/plugin-opener
```

### 10.3 tauri.conf.json 关键配置

```jsonc
{
  "productName": "个人财务",
  "identifier": "com.yourname.personalfinance",  // 必须是反向域名，用于 app_data_dir 路径
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "title": "个人财务",
        "width": 1200,
        "height": 800,
        "minWidth": 960,
        "minHeight": 640
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],           // Windows 用 NSIS 即可，不需要 MSI
    "icon": ["icons/icon.ico"],
    "createUpdaterArtifacts": false // 纯本地不做自动更新
  },
  "plugins": {
    "sql": {
      "preload": ["sqlite:finance.db"]  // 数据库文件名，实际路径由 Tauri 解析到 app_data_dir
    }
  }
}
```

> `identifier` 决定 `app_data_dir` 的最终路径：Windows 为 `{FOLDERID_RoamingAppData}/{bundleIdentifier}`，macOS 为 `~/Library/Application Support/{bundleIdentifier}`。

---

## 11. 打包与发布

### 11.1 Windows NSIS 安装包

纯本地个人版只需 NSIS，不需要 MSI，也不需要自动更新。

```jsonc
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "icon": ["icons/icon.ico"],
  "createUpdaterArtifacts": false,
  "windows": {
    "nsis": {
      "installMode": "currentUser",      // 个人使用，当前用户安装即可
      "languages": ["SimpChinese"],      // 安装向导使用简体中文（不配则默认英文）
      "displayLanguageSelector": false   // 不弹语言选择，直接按 languages 使用
    }
  }
}
```

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/nsis/`。安装向导界面语言由 `languages` 决定，可选值见 Tauri 的 NSIS 语言标识（如 `SimpChinese`、`English`、`TradChinese`）；写成 `"all"` 并开启 `displayLanguageSelector` 可让用户在安装时选择。

### 11.2 代码签名（可选）

Windows SmartScreen 对未签名安装包会弹出警告。有条件时可用 OV / EV 证书签名；个人自用可以跳过，首次运行在 SmartScreen 中手动允许即可。

### 11.3 明确不做的事

- **不做自动更新**：`createUpdaterArtifacts: false`，不集成 `tauri-plugin-updater`，不配置更新端点。
- **不做跨平台 CI**：手动在目标平台构建即可。
- **不做 macOS 公证**：除非需要分发，个人使用可跳过。

---

## 12. 菜单设计

### 12.1 设计原则

1. 一级菜单不超过 8 个，超过说明模块该合并。
2. 工作台是默认首页，打开即看到钱和待办。
3. 合同是业务源头，合同详情页承载「计划、流水、发票、变更、附件」五个 Tab，不把计划单独做成一级菜单。
4. 报表不做成一级大模块，归入「分析」分组，个人版 3 张表足够。
5. 设置收拢系统能力：备份、导出、提醒天数、分类管理都进设置，不散落。
6. 菜单徽标只显示「需要行动」的数字：逾期计划数、待处理发票数、回收站条数，不做全量计数。
7. P1 / P2 功能用 Feature Flag 隐藏，首版菜单保持精简。

### 12.2 菜单树（一级 / 二级 / 三级）

左侧可折叠侧边栏 + 分组标题：

```text
┌ 工作台                    [badge: 待办数]
│
├ 业务
│  ├ 合同台账               [badge: 逾期合同数]
│  └ 收付款计划             [badge: 逾期计划数]
│
├ 资金
│  ├ 收支流水
│  ├ 账户管理
│  └ 收支分类
│
├ 票据
│  └ 发票管理               [已开放]
│
├ 分析
│  ├ 合同执行表
│  ├ 收支结余表
│  └ 应收应付表
│
├ 回收站                    [badge: 可恢复条数]   （P1）
│
└ 设置
   ├ 常规设置
   ├ 备份与恢复
   ├ 数据导入导出
   └ 关于
```

说明：

- **收付款计划**保留一级入口：个人用户经常「只看待收待付」，不想先进合同再点 Tab；合同详情页内仍有「计划」Tab，两处数据同源。
- **发票管理**已开放：普票/专票、已开/未开，按合同核对开票进度；合同详情内仍保留发票 Tab，两处数据同源。
- **回收站** P1 才出现；当前删除用「二次确认 + 自动备份兜底」。
- **分析**三张表：已做「合同执行表」和「收支结余表」，应收应付表 P1。

> 当前实现：`src/layouts/AppLayout.vue` 已开放发票管理，`FEATURE_P1` 仅控制回收站入口。
