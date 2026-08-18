import { Pool } from 'pg'

export interface TenantRow {
  id: string
  slug: string
  db_name: string
}

const pools = new Map<string, Pool>()

export function getTenantPool(tenant: TenantRow): Pool {
  const existing = pools.get(tenant.id)
  if (existing) return existing

  const pool = new Pool({
    host: process.env.PG_TENANT_HOST,
    port: parseInt(process.env.PG_TENANT_PORT || '5432'),
    user: process.env.PG_TENANT_USER,
    password: process.env.PG_TENANT_PASSWORD,
    database: tenant.db_name,
    max: parseInt(process.env.TENANT_POOL_MAX || '5'),
  })
  pool.on('error', (err) => {
    console.error(`Unexpected error on idle client for tenant ${tenant.slug}`, err)
  })
  pools.set(tenant.id, pool)
  return pool
}

// Closes and forgets the cached pool for a tenant so the next request opens a
// fresh connection. Required before a restore (pg_restore --clean will drop
// tables that pooled connections may still be holding open).
export async function evictTenantPool(tenantId: string): Promise<void> {
  const existing = pools.get(tenantId)
  if (!existing) return
  pools.delete(tenantId)
  try {
    await existing.end()
  } catch (err) {
    console.error(`Error closing pool for tenant ${tenantId}:`, err)
  }
}

// CLI args + env for pg_dump/pg_restore. The password is passed via the
// PGPASSWORD env var rather than embedded in a connection string argument:
// command-line arguments are visible to any local user via `ps aux` /
// /proc/<pid>/cmdline, and are echoed verbatim into child_process error
// messages when the command fails — both would otherwise leak the shared
// tenant DB password (any tenant's own backup failure could expose the
// credentials for every other tenant's database).
export function tenantPgArgs(tenant: TenantRow): { args: string[]; env: NodeJS.ProcessEnv } {
  const host = process.env.PG_TENANT_HOST || 'localhost'
  const port = process.env.PG_TENANT_PORT || '5432'
  const user = process.env.PG_TENANT_USER || ''
  const password = process.env.PG_TENANT_PASSWORD || ''
  return {
    args: ['-h', host, '-p', port, '-U', user, '-d', tenant.db_name],
    env: { ...process.env, PGPASSWORD: password },
  }
}
