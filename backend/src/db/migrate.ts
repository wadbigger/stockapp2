import { Pool } from 'pg'
import dotenv from 'dotenv'
dotenv.config()
import { migrateTenantDb } from './schema'
import { migratePlatformDb } from './platformSchema'

// Dev/local-only CLI. Connects directly (not through the tenant-context proxy)
// since there is no request in flight to resolve a tenant from.
async function main() {
  const isPlatform = process.argv.includes('--platform')
  const connectionString = isPlatform ? process.env.CONTROL_DB_URL : process.env.DATABASE_URL
  const pool = new Pool({ connectionString })
  try {
    console.log(`Running ${isPlatform ? 'platform' : 'tenant'} migrations...`)
    if (isPlatform) await migratePlatformDb(pool)
    else await migrateTenantDb(pool)
    console.log('Migrations completed.')
  } finally {
    await pool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration error:', err)
    process.exit(1)
  })
