import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import platformPool from '../db/platformPool'
import { tenantPgArgs, evictTenantPool, TenantRow } from '../db/tenantPoolManager'
import { terminateConnections } from '../db/adminPool'

// child_process error messages include the full command + args verbatim,
// and pg_dump/pg_restore stderr can echo back argv on usage errors. Even
// though the password itself now travels via PGPASSWORD (never as an arg),
// strip anything that looks like a connection string as a defense-in-depth
// measure before this text is ever logged or returned to a caller.
function sanitizePgError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]')
}

const execFileAsync = promisify(execFile)

const BACKUPS_DIR = process.env.BACKUPS_DIR
  ? path.resolve(process.env.BACKUPS_DIR)
  : path.join(__dirname, '../../backups')

export interface BackupResult {
  filePath: string
  filename: string
  sizeBytes: number
}

export async function runBackup(tenant: TenantRow, triggeredBy: string): Promise<BackupResult> {
  const tenantDir = path.join(BACKUPS_DIR, tenant.slug)
  if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true })

  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.dump`
  const filePath = path.join(tenantDir, filename)
  const pgDump = process.env.PG_DUMP_PATH || 'pg_dump'
  const { args, env } = tenantPgArgs(tenant)

  try {
    await execFileAsync(pgDump, ['-Fc', '-f', filePath, ...args], { env })
    const sizeBytes = fs.statSync(filePath).size
    await platformPool.query(
      `INSERT INTO backups (tenant_id, filename, size_bytes, status, triggered_by) VALUES ($1,$2,$3,'completed',$4)`,
      [tenant.id, filename, sizeBytes, triggeredBy]
    )
    return { filePath, filename, sizeBytes }
  } catch (err) {
    await platformPool.query(
      `INSERT INTO backups (tenant_id, filename, status, triggered_by) VALUES ($1,$2,'failed',$3)`,
      [tenant.id, filename, triggeredBy]
    )
    console.error(`Backup failed for tenant ${tenant.slug}:`, sanitizePgError(err))
    throw new Error(`pg_dump a échoué pour le tenant ${tenant.slug}: ${sanitizePgError(err)}`)
  }
}

export function backupFilePath(slug: string, filename: string): string {
  return path.join(BACKUPS_DIR, slug, filename)
}

// Directory where a tenant's backup files live, created on demand. Used both
// for pg_dump output (runBackup) and for persisting admin-uploaded dump files
// meant for a manual restore.
export function tenantBackupsDir(slug: string): string {
  const dir = path.join(BACKUPS_DIR, slug)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Restores a tenant's dedicated database from a previously taken backup file.
// Destructive: drops and recreates every object in the target database
// (--clean --if-exists), so callers must take a fresh safety backup first.
export async function restoreBackup(tenant: TenantRow, filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier de sauvegarde introuvable: ${filePath}`)
  }

  // Evict the cached pool and kill in-flight sessions so pg_restore --clean
  // doesn't collide with locks held by active application connections.
  await evictTenantPool(tenant.id)
  await terminateConnections(tenant.db_name)

  const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore'
  const { args, env } = tenantPgArgs(tenant)

  try {
    await execFileAsync(pgRestore, [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      ...args,
      filePath,
    ], { env })
  } catch (err) {
    console.error(`Restore failed for tenant ${tenant.slug}:`, sanitizePgError(err))
    throw new Error(`pg_restore a échoué pour le tenant ${tenant.slug}: ${sanitizePgError(err)}`)
  } finally {
    // Drop the (now stale) cached pool once more in case a request re-created
    // it while the restore was running; the next request opens a clean one.
    await evictTenantPool(tenant.id)
  }
}
