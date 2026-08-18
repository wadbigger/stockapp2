import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import { Pool } from 'pg'

dotenv.config()

import authRouter from './routes/auth'
import usersRouter from './routes/users'
import settingsRouter from './routes/settings'
import categoriesRouter from './routes/categories'
import productsRouter from './routes/products'
import stockRouter from './routes/stock'
import clientsRouter from './routes/clients'
import quotesRouter from './routes/quotes'
import invoicesRouter from './routes/invoices'
import dashboardRouter from './routes/dashboard'
import reportsRouter from './routes/reports'
import salesRouter from './routes/sales'
import sitesRouter from './routes/sites'
import platformRouter from './routes/platform'
import { errorHandler } from './middleware/errorHandler'
import { apiLimiter, platformLimiter } from './middleware/rateLimit'
import platformPool from './db/platformPool'
import { migratePlatformDb } from './db/platformSchema'
import { seedDemoDefaults } from './services/seedService'
import { getTenantPool } from './db/tenantPoolManager'
import { migrateTenantDb } from './db/schema'
import { syncTenantUserIndex } from './services/userIndexService'

const app = express()

// Behind a reverse proxy (Nginx) in production: needed so express-rate-limit
// and req.ip see the real client IP from X-Forwarded-For instead of the
// proxy's own address (which would otherwise put every visitor in the same
// rate-limit bucket).
app.set('trust proxy', 1)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
// Authentication uses Bearer tokens (not cookies), so credentialed CORS is
// unnecessary; `origin: '*'` combined with `credentials: true` is also an
// invalid/flagged combination per the Fetch spec.
app.use(cors({ origin: '*' }))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
app.use('/api', apiLimiter)

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/stock', stockRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/sales', salesRouter)
app.use('/api/sites', sitesRouter)
app.use('/api/platform', platformLimiter, platformRouter)

app.get('/api/health', async (req, res) => {
  try {
    await platformPool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error', message: 'Base de contrôle indisponible' })
  }
})

// Serve frontend in production
const frontendDist = path.join(__dirname, '../../frontend/dist')
const fs = require('fs')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

app.use(errorHandler)

const PORT = parseInt(process.env.PORT || '3000')

// Applies any pending tenant-database schema changes (e.g. the `login`
// column) to every provisioned tenant on boot, then reconciles
// platform_user_index so existing users keep working. New tenants are
// already migrated synchronously at provisioning time; this covers tenants
// that existed before a given migration was introduced.
async function migrateAllTenants(): Promise<void> {
  const { rows: tenants } = await platformPool.query(
    "SELECT id, slug, db_name FROM tenants WHERE status != 'failed'"
  )
  for (const tenant of tenants) {
    try {
      const tenantPool = getTenantPool(tenant)
      await migrateTenantDb(tenantPool)
      await syncTenantUserIndex(platformPool, tenantPool, tenant.id)
    } catch (err) {
      console.error(`Failed to migrate tenant ${tenant.slug}:`, err)
    }
  }
  console.log(`Tenant migrations OK (${tenants.length} tenant(s))`)
}

async function startServer() {
  try {
    await platformPool.query('SELECT 1')
    console.log('Platform database connected')
    await migratePlatformDb(platformPool)
    console.log('Platform migrations OK')

    await migrateAllTenants()

    // Dev/local convenience only: seed demo data directly into the legacy
    // single-tenant DATABASE_URL when explicitly requested. Never used for
    // real tenant provisioning (see services/tenantProvisioning.ts).
    if (process.env.SEED_DEMO_DATA === 'true' && process.env.DATABASE_URL) {
      const legacyPool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        const { migrateTenantDb } = await import('./db/schema')
        await migrateTenantDb(legacyPool)
        await seedDemoDefaults(legacyPool)
        console.log('Demo data seeded into legacy DATABASE_URL')
      } finally {
        await legacyPool.end()
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

startServer()
