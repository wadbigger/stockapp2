import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

export interface TenantAdminSeed {
  email: string
  login: string
  passwordHash: string
  name: string
  companyName: string
}

export async function seedTenantAdmin(pool: Pool, opts: TenantAdminSeed): Promise<void> {
  const userRes = await pool.query(
    `INSERT INTO users (email, login, password_hash, name, role) VALUES ($1,$2,$3,$4,'admin') RETURNING id`,
    [opts.email, opts.login, opts.passwordHash, opts.name]
  )
  const adminId = userRes.rows[0].id

  await pool.query(
    `INSERT INTO company_settings (name, currency, default_vat_rate) VALUES ($1, 'FCFA', 18)`,
    [opts.companyName]
  )

  const siteRes = await pool.query(
    `INSERT INTO sites (name) VALUES ('Magasin Principal') RETURNING id`
  )
  const siteId = siteRes.rows[0].id
  await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2)', [adminId, siteId])
}

export async function seedDemoDefaults(pool: Pool): Promise<void> {
  const saCheck = await pool.query("SELECT id FROM users WHERE email='superadmin@example.com'")
  let superAdminId: string
  if (saCheck.rows.length === 0) {
    const saHash = await bcrypt.hash('super123', 10)
    const saRes = await pool.query(
      "INSERT INTO users (email, login, password_hash, name, role) VALUES ('superadmin@example.com','superadmin',$1,'Super Admin','superadmin') RETURNING id",
      [saHash]
    )
    superAdminId = saRes.rows[0].id
    console.log('Default superadmin created: login "superadmin" / super123')
  } else {
    superAdminId = saCheck.rows[0].id
  }

  const { rows } = await pool.query("SELECT id FROM users WHERE email='admin@example.com'")
  let adminId: string
  if (rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10)
    const res = await pool.query(
      "INSERT INTO users (email, login, password_hash, name, role) VALUES ('admin@example.com','admin',$1,'Administrateur','admin') RETURNING id",
      [hash]
    )
    adminId = res.rows[0].id
    console.log('Default admin created: login "admin" / admin123')
  } else {
    adminId = rows[0].id
  }

  const settingsCheck = await pool.query('SELECT id FROM company_settings LIMIT 1')
  if (settingsCheck.rows.length === 0) {
    await pool.query(
      `INSERT INTO company_settings (name, address, default_vat_rate, currency, legal_mentions)
       VALUES ('Mon Entreprise', 'Cotonou, Bénin', 18, 'FCFA', 'Conditions de paiement : 30 jours nets.')`
    )
  }

  const siteCheck = await pool.query('SELECT id FROM sites LIMIT 1')
  if (siteCheck.rows.length === 0) {
    const sRes = await pool.query(
      "INSERT INTO sites (name, address) VALUES ('Magasin Principal', 'Cotonou, Bénin') RETURNING id"
    )
    const siteId = sRes.rows[0].id
    await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [adminId, siteId])
    await pool.query('UPDATE products SET site_id = $1 WHERE site_id IS NULL', [siteId])
    await pool.query('UPDATE categories SET site_id = $1 WHERE site_id IS NULL', [siteId])
    await pool.query('UPDATE clients SET site_id = $1 WHERE site_id IS NULL', [siteId])
    await pool.query('UPDATE invoices SET site_id = $1 WHERE site_id IS NULL', [siteId])
    await pool.query('UPDATE quotes SET site_id = $1 WHERE site_id IS NULL', [siteId])
    await pool.query('UPDATE stock_movements SET site_id = $1 WHERE site_id IS NULL', [siteId])
    console.log('Default site created and existing data assigned')
  }

  const allUsers = await pool.query('SELECT id FROM users')
  const firstSite = await pool.query('SELECT id FROM sites ORDER BY created_at ASC LIMIT 1')
  if (firstSite.rows.length > 0) {
    for (const u of allUsers.rows) {
      await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, firstSite.rows[0].id])
    }
  }

  const allSites = await pool.query('SELECT id FROM sites')
  for (const s of allSites.rows) {
    await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [superAdminId, s.id])
  }
}
