// 合同文件索引仓储：文件实体在 attachments 目录，这里只维护检索用的元数据
import { queryAll, queryOne, update } from '@/db/database'
import type { SqlValue } from 'sql.js'
import type { ContractFile } from '@/types/models'

export interface ContractFileInput {
  contract_id: number | null
  rel_path: string
  name: string
  size: number
  mime: string
  source_path?: string | null
}

/** 列出文件；可按合同或关键字过滤 */
export function listContractFiles(options: { contractId?: number; keyword?: string } = {}): ContractFile[] {
  const where: string[] = []
  const params: SqlValue[] = []
  if (options.contractId) {
    where.push('f.contract_id = ?')
    params.push(options.contractId)
  }
  if (options.keyword) {
    where.push('(f.name LIKE ? OR f.source_path LIKE ? OR c.title LIKE ?)')
    const like = `%${options.keyword}%`
    params.push(like, like, like)
  }
  const sql = `
    SELECT f.*, c.title AS contract_title
    FROM contract_files f
    LEFT JOIN contracts c ON c.id = f.contract_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY f.created_at DESC, f.id DESC
  `
  return queryAll<ContractFile>(sql, params)
}

/** 按相对路径查重 */
export function findContractFileByRelPath(relPath: string): ContractFile | null {
  return queryOne<ContractFile>('SELECT * FROM contract_files WHERE rel_path = ?', [relPath])
}

/** 新增文件索引，返回自增 ID */
export function addContractFile(input: ContractFileInput): number {
  return update(
    `INSERT INTO contract_files (contract_id, rel_path, name, size, mime, source_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.contract_id,
      input.rel_path,
      input.name,
      input.size,
      input.mime,
      input.source_path ?? null,
    ],
  )
}

/** 删除文件索引（文件实体由调用方另行删除） */
export function deleteContractFile(id: number): void {
  update('DELETE FROM contract_files WHERE id = ?', [id])
}
