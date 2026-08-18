import { Pool } from 'pg'

export const PLATFORM_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  db_name VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning','active','suspended','failed')),
  display_name VARCHAR(255) DEFAULT '',
  logo_url TEXT DEFAULT '',
  primary_color VARCHAR(20) DEFAULT '#2563eb',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maps a platform-wide unique login (or, for rows not yet migrated, email)
-- to the tenant it belongs to, so /auth/lookup can find the right tenant
-- before a password is even entered. "login" is the authentication key;
-- "email" is kept only for reference/notifications and is no longer unique.
CREATE TABLE IF NOT EXISTS platform_user_index (
  email VARCHAR(255) PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE platform_user_index ADD COLUMN IF NOT EXISTS login VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS platform_user_index_login_unique_idx
  ON platform_user_index (LOWER(login));

CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  triggered_by VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing: subscription plans offered to tenants.
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  price_monthly DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One current subscription per tenant (upserted on change, not historized).
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','canceled')),
  amount_monthly DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  current_period_end DATE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail of platform-admin actions (suspend, reactivate, backup, restore, billing changes).
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  details TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
`

export async function migratePlatformDb(pool: Pool): Promise<void> {
  await pool.query(PLATFORM_SCHEMA_SQL)
}
