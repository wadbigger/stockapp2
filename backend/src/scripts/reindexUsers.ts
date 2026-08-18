import dotenv from 'dotenv'
dotenv.config()
import platformPool from '../db/platformPool'
import { getTenantPool } from '../db/tenantPoolManager'
import { migrateTenantDb } from '../db/schema'
import { syncTenantUserIndex } from '../services/userIndexService'

// One-time / on-demand repair script: manually re-runs, for every tenant,
// the same schema migration + platform_user_index reconciliation that
// happens automatically on server startup (see migrateAllTenants() in
// index.ts). Useful to run by hand right after deploying a migration
// without waiting for/restarting the server.
//
// Usage: ts-node src/scripts/reindexUsers.ts

async function main() {
  const { rows: tenants } = await platformPool.query('SELECT id, slug, db_name FROM tenants')

  for (const tenant of tenants) {
    const pool = getTenantPool(tenant)
    try {
      await migrateTenantDb(pool)
      await syncTenantUserIndex(platformPool, pool, tenant.id)
      console.log(`Tenant ${tenant.slug}: migrated and reindexed.`)
    } catch (err) {
      console.error(`Skipping tenant ${tenant.slug} (${tenant.id}):`, err)
    }
  }

  console.log('Done.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reindex failed:', err)
    process.exit(1)
  })
