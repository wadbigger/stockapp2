import { Pool } from 'pg'

// platform_user_index maps each platform-wide unique `login` to the tenant
// it belongs to; /auth/lookup and /auth/login rely on it to resolve which
// tenant database to check before validating a password. Whenever a
// tenant's users table changes (creation, edit, or — on startup — a schema
// migration that backfills logins for older rows), this index must be kept
// in sync or the affected user becomes unable to log in.
export async function upsertUserIndexEntry(
  platformPool: Pool,
  entry: { login: string; email: string; tenantId: string }
): Promise<void> {
  await platformPool.query(
    `INSERT INTO platform_user_index (login, email, tenant_id) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET login = EXCLUDED.login, tenant_id = EXCLUDED.tenant_id`,
    [entry.login, entry.email, entry.tenantId]
  )
}

export async function removeUserIndexEntryByLogin(platformPool: Pool, login: string): Promise<void> {
  await platformPool.query('DELETE FROM platform_user_index WHERE LOWER(login) = $1', [login.toLowerCase()])
}

// Bulk reconciliation used at server startup: makes sure every user already
// present in a tenant's own database also has a row here. Silently skips
// any login that's already claimed by a different tenant instead of
// stealing it — that scenario means two tenants ended up with the same
// login and needs a human to pick which account keeps it.
export async function syncTenantUserIndex(platformPool: Pool, tenantPool: Pool, tenantId: string): Promise<void> {
  const { rows: users } = await tenantPool.query('SELECT login, email FROM users WHERE login IS NOT NULL')
  for (const u of users) {
    const login = (u.login || '').toLowerCase()
    if (!login) continue
    const { rows: existing } = await platformPool.query(
      'SELECT tenant_id FROM platform_user_index WHERE LOWER(login) = $1',
      [login]
    )
    if (existing.length > 0 && existing[0].tenant_id !== tenantId) {
      console.warn(`Login conflict: "${login}" already indexed under a different tenant — skipping for tenant ${tenantId}.`)
      continue
    }
    await upsertUserIndexEntry(platformPool, { login, email: u.email, tenantId })
  }
}
