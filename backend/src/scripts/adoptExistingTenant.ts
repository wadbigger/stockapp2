import { Pool } from 'pg'
import dotenv from 'dotenv'
dotenv.config()
import platformPool from '../db/platformPool'
import { migrateTenantDb } from '../db/schema'
import { syncTenantUserIndex } from '../services/userIndexService'

// One-time CLI script: adopts the current standalone installation (its data
// already lives in DATABASE_URL) as tenant zero of the new multi-tenant
// platform. Does NOT create a new database — the existing one is reused as-is.
//
// Usage: ts-node src/scripts/adoptExistingTenant.ts --slug=monentreprise --name="Mon Entreprise"

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : undefined
}

async function main() {
  const slug = arg('slug')
  const name = arg('name')
  if (!slug || !name) {
    console.error('Usage: ts-node src/scripts/adoptExistingTenant.ts --slug=<slug> --name="<Nom>"')
    process.exit(1)
  }
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    console.error('Slug invalide (lettres minuscules, chiffres, tirets)')
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL manquant dans .env')
    process.exit(1)
  }
  const dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '')
  if (!dbName) {
    console.error('Impossible de déterminer le nom de la base depuis DATABASE_URL')
    process.exit(1)
  }

  const tenantPool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const existing = await platformPool.query('SELECT id FROM tenants WHERE slug = $1 OR db_name = $2', [slug, dbName])
    if (existing.rows.length > 0) {
      console.error(`Un tenant existe déjà pour ce slug ou cette base (id=${existing.rows[0].id})`)
      process.exit(1)
    }

    console.log(`Migration idempotente de la base existante "${dbName}"...`)
    await migrateTenantDb(tenantPool)
    console.log('Colonne "login" backfillée pour les utilisateurs existants (dérivée de leur email).')

    const settingsRes = await tenantPool.query('SELECT name, logo_url, primary_color FROM company_settings LIMIT 1')
    const settings = settingsRes.rows[0] || {}

    const tenantRes = await platformPool.query(
      `INSERT INTO tenants (slug, name, db_name, status, display_name, logo_url, primary_color)
       VALUES ($1,$2,$3,'active',$4,$5,$6) RETURNING id`,
      [slug, name, dbName, settings.name || name, settings.logo_url || '', settings.primary_color || '#2563eb']
    )
    const tenantId = tenantRes.rows[0].id
    console.log(`Tenant créé: ${tenantId} (slug=${slug}, db=${dbName})`)

    await syncTenantUserIndex(platformPool, tenantPool, tenantId)
    const usersRes = await tenantPool.query('SELECT login FROM users')
    console.log(`${usersRes.rows.length} utilisateur(s) indexé(s) pour la connexion.`)
    console.log('Adoption terminée. Les utilisateurs existants peuvent se connecter avec leur login et leur mot de passe.')
    console.log('Logins générés :', usersRes.rows.map((r: any) => r.login).join(', '))
  } finally {
    await tenantPool.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Échec de l\'adoption:', err)
    process.exit(1)
  })
