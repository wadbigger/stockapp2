import { Pool } from 'pg'
import dotenv from 'dotenv'
dotenv.config()
import { seedDemoDefaults } from '../services/seedService'

// Dev/local-only CLI — demo data for a standalone (non-SaaS) sandbox install.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    console.log('Seeding demo data...')
    await seedDemoDefaults(pool)
    console.log('Seed completed.')
  } finally {
    await pool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed error:', err)
    process.exit(1)
  })
