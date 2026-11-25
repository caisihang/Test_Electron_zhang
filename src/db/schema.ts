// 数据库迁移脚本集中管理，版本号唯一且递增
// 说明：Web 预览模式下使用 sql.js(WASM) 执行；接入 Tauri 后可原样交给 tauri-plugin-sql

export interface Migration {
  version: number
  description: string
  sql: string
}

// 001 核心业务表：账户 / 合同 / 计划 / 流水 / 变更 / 分类
const CORE_SQL = `
-- 1. 账户
CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    account_type  TEXT NOT NULL DEFAULT 'bank',
    initial_balance REAL NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'CNY',
    is_archived   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 2. 合同
CREATE TABLE IF NOT EXISTS contracts (
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
    deleted_at      TEXT
);

-- 3. 收付款计划
CREATE TABLE IF NOT EXISTS schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id),
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    label           TEXT,
    due_date        TEXT NOT NULL,
    planned_amount  REAL NOT NULL,
    actual_amount   REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','settled','overdue')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 4. 流水（实际收付）
CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL REFERENCES accounts(id),
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    amount          REAL NOT NULL,
    txn_date        TEXT NOT NULL,
    category_l1     TEXT,
    category_l2     TEXT,
    contract_id     INTEGER REFERENCES contracts(id),
    schedule_id     INTEGER REFERENCES schedules(id),
    counterparty    TEXT,
    note            TEXT,
    voucher_path    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    deleted_at      TEXT
);

-- 5. 合同变更历史
CREATE TABLE IF NOT EXISTS contract_changes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id),
    field_name      TEXT NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    changed_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 6. 分类（用户可自定义）
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER REFERENCES categories(id),
    name        TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
    sort_order  INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_contracts_deleted ON contracts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_schedules_contract ON schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_txns_contract ON transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_txns_schedule ON transactions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_txns_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_categories_direction ON categories(direction);
`

// 002 发票（轻量）
const INVOICE_SQL = `
CREATE TABLE IF NOT EXISTS invoices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no      TEXT,
    direction       TEXT NOT NULL CHECK (direction IN ('issued','received')),
    amount          REAL NOT NULL,
    tax_rate        REAL DEFAULT 0,
    invoice_date    TEXT,
    contract_id     INTEGER REFERENCES contracts(id),
    transaction_id  INTEGER REFERENCES transactions(id),
    status          TEXT DEFAULT 'normal',
    attachment_path TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
`

// 003 设置（提醒天数等，随备份一起迁移）
const SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`

// 004 合同文件索引：导入台账的文件元数据（文件实体在 attachments 目录，DB 只存相对路径）
const CONTRACT_FILES_SQL = `
CREATE TABLE IF NOT EXISTS contract_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER REFERENCES contracts(id),
    rel_path    TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    mime        TEXT NOT NULL DEFAULT '',
    source_path TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_contract_files_contract ON contract_files(contract_id);
`

// 005 计划到期日改为可空
// SQLite 不支持直接改列约束，按官方推荐步骤重建表；重建期间关闭外键约束
const SCHEDULE_DUE_OPTIONAL_SQL = `
PRAGMA foreign_keys = OFF;
CREATE TABLE schedules_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id),
    direction       TEXT NOT NULL CHECK (direction IN ('income','expense')),
    label           TEXT,
    due_date        TEXT,
    planned_amount  REAL NOT NULL,
    actual_amount   REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','settled','overdue')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO schedules_new
    (id, contract_id, direction, label, due_date, planned_amount, actual_amount, status, sort_order, created_at)
  SELECT id, contract_id, direction, label, NULLIF(due_date, ''), planned_amount, actual_amount, status, sort_order, created_at
  FROM schedules;
DROP TABLE schedules;
ALTER TABLE schedules_new RENAME TO schedules;
CREATE INDEX IF NOT EXISTS idx_schedules_contract ON schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(due_date);
PRAGMA foreign_keys = ON;
`

// 006 发票增加类型（普票/专票）与开票状态（已开/未开）
// 历史数据：原本填过开票日期的视为已开
const INVOICE_EXTEND_SQL = `
ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'ordinary';
ALTER TABLE invoices ADD COLUMN issue_status TEXT NOT NULL DEFAULT 'not_issued';
UPDATE invoices SET issue_status = 'issued' WHERE invoice_date IS NOT NULL AND invoice_date <> '';
`

export const MIGRATIONS: Migration[] = [
  { version: 1, description: 'create_core_tables', sql: CORE_SQL },
  { version: 2, description: 'add_invoices', sql: INVOICE_SQL },
  { version: 3, description: 'add_settings', sql: SETTINGS_SQL },
  { version: 4, description: 'add_contract_files', sql: CONTRACT_FILES_SQL },
  { version: 5, description: 'schedule_due_date_optional', sql: SCHEDULE_DUE_OPTIONAL_SQL },
  { version: 6, description: 'invoice_type_and_issue_status', sql: INVOICE_EXTEND_SQL },
]

/** 最新 schema 版本，写入备份包 manifest */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
