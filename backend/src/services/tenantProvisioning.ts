import bcrypt from 'bcryptjs'
import platformPool from '../db/platformPool'
import { createDatabase, dropDatabase } from '../db/adminPool'
import { getTenantPool } from '../db/tenantPoolManager'
import { migrateTenantDb } from '../db/schema'
import { seedTenantAdmin } from './seedService'
import { normalizeEmail, normalizeLogin } from '../utils/email'

const LOGIN_PATTERN = /^[a-z0-9_.-]{3,50}$/

export interface ProvisionTenantInput {
  slug: string
  name: string
  adminEmail: string
  adminLogin: string
  adminPassword: string
  primaryColor?: string
}

export interface ProvisionTenantResult {
  tenantId: string
  slug: string
  dbName: string
}

function slugToDbName(slug: string): string {
  return `stockapp_tenant_${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const slug = input.slug.toLowerCase().trim()
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    throw new Error('Slug invalide (lettres minuscules, chiffres, tirets)')
  }
  const adminEmail = normalizeEmail(input.adminEmail)
  const adminLogin = normalizeLogin(input.adminLogin)
  if (!LOGIN_PATTERN.test(adminLogin)) {
    throw new Error('Login administrateur invalide (3-50 caractères : lettres, chiffres, points, tirets ou underscores)')
  }

  const existing = await platformPool.query('SELECT id FROM tenants WHERE slug = $1', [slug])
  if (existing.rows.length > 0) throw new Error(`Le slug "${slug}" est déjà utilisé`)

  const loginTaken = await platformPool.query('SELECT 1 FROM platform_user_index WHERE LOWER(login) = $1', [adminLogin])
  if (loginTaken.rows.length > 0) throw new Error(`Le login "${adminLogin}" est déjà associé à un tenant`)

  const dbName = slugToDbName(slug)

  const tenantRes = await platformPool.query(
    `INSERT INTO tenants (slug, name, db_name, status, display_name, primary_color)
     VALUES ($1,$2,$3,'provisioning',$2,$4) RETURNING id`,
    [slug, input.name, dbName, input.primaryColor || '#2563eb']
  )
  const tenantId = tenantRes.rows[0].id

  try {
    await createDatabase(dbName)
    const pool = getTenantPool({ id: tenantId, slug, db_name: dbName })
    await migrateTenantDb(pool)

    const passwordHash = await bcrypt.hash(input.adminPassword, 10)
    await seedTenantAdmin(pool, {
      email: adminEmail,
      login: adminLogin,
      passwordHash,
      name: 'Administrateur',
      companyName: input.name,
    })

    await platformPool.query('INSERT INTO platform_user_index (login, email, tenant_id) VALUES ($1,$2,$3)', [adminLogin, adminEmail, tenantId])
    await platformPool.query("UPDATE tenants SET status='active' WHERE id=$1", [tenantId])
    await platformPool.query(
      `INSERT INTO subscriptions (tenant_id, status, amount_monthly, currency)
       VALUES ($1, 'trialing', 0, 'FCFA') ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    )
    await platformPool.query(
      `INSERT INTO audit_log (tenant_id, action, details) VALUES ($1, 'tenant_created', $2)`,
      [tenantId, `slug=${slug}`]
    )

    return { tenantId, slug, dbName }
  } catch (err) {
    console.error(`Provisioning failed for tenant ${slug}:`, err)
    try {
      await dropDatabase(dbName)
    } catch (dropErr) {
      console.error(`Failed to clean up database ${dbName} after failed provisioning:`, dropErr)
    }
    await platformPool.query("UPDATE tenants SET status='failed' WHERE id=$1", [tenantId])
    throw err
  }
}
