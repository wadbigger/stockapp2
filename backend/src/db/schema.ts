import { Pool } from 'pg'

export const TENANT_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'vendeur' CHECK (role IN ('admin','vendeur','gestionnaire','comptable')),
  active BOOLEAN DEFAULT true,
  refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) DEFAULT '',
  logo_url TEXT DEFAULT '',
  address TEXT DEFAULT '',
  siret VARCHAR(100) DEFAULT '',
  vat_number VARCHAR(100) DEFAULT '',
  default_vat_rate DECIMAL(5,2) DEFAULT 18.00,
  currency VARCHAR(20) DEFAULT 'FCFA',
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  website VARCHAR(255) DEFAULT '',
  legal_mentions TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0,
  sale_price DECIMAL(15,2) DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'pièce',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  alert_threshold INTEGER DEFAULT 5,
  current_stock INTEGER DEFAULT 0,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (type IN ('client','fournisseur')),
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  address TEXT DEFAULT '',
  tax_number VARCHAR(100) DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number VARCHAR(50) UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id),
  status VARCHAR(50) DEFAULT 'brouillon' CHECK (status IN ('brouillon','envoye','accepte','refuse','expire')),
  validity_date DATE,
  comment TEXT DEFAULT '',
  subtotal_ht DECIMAL(15,2) DEFAULT 0,
  total_tva DECIMAL(15,2) DEFAULT 0,
  total_ttc DECIMAL(15,2) DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quote_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  qty DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(15,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  vat_rate DECIMAL(5,2) DEFAULT 18,
  total_ht DECIMAL(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number VARCHAR(50) UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise','partiellement_payee','payee','annulee')),
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_method VARCHAR(50) DEFAULT 'virement',
  subtotal_ht DECIMAL(15,2) DEFAULT 0,
  total_tva DECIMAL(15,2) DEFAULT 0,
  total_ttc DECIMAL(15,2) DEFAULT 0,
  amount_paid DECIMAL(15,2) DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  qty DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(15,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  vat_rate DECIMAL(5,2) DEFAULT 18,
  total_ht DECIMAL(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  method VARCHAR(50) DEFAULT 'virement',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entree','sortie','ajustement','vente')),
  quantity DECIMAL(10,3) NOT NULL,
  reason TEXT DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_ref VARCHAR(255) DEFAULT '',
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoice_sequences (
  year INTEGER NOT NULL,
  prefix VARCHAR(10) NOT NULL,
  last_number INTEGER DEFAULT 0,
  PRIMARY KEY (year, prefix)
);

-- Multi-site
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_sites (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, site_id)
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS closed_days (
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  closed_date DATE NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by UUID REFERENCES users(id),
  PRIMARY KEY (site_id, closed_date)
);

-- Add superadmin role
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','admin','vendeur','gestionnaire','comptable'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- White-label branding (mirrored to control-plane on save)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) DEFAULT '#2563eb';

-- Login identifier: replaces email as the authentication key (email is kept
-- for notifications only, so it no longer needs to be unique). Added
-- nullable first; migrateTenantDb() backfills it in JS (dedup per tenant)
-- before the NOT NULL + unique index below are enforced.
ALTER TABLE users ADD COLUMN IF NOT EXISTS login VARCHAR(100);
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
`

const ENFORCE_LOGIN_CONSTRAINT_SQL = `
ALTER TABLE users ALTER COLUMN login SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_unique_idx ON users (LOWER(login));
`

function loginFromEmail(email: string): string {
  const base = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_.-]/g, '')
  return base || 'user'
}

// Assigns a login to any user missing one (e.g. rows created before this
// column existed), deduplicating within the tenant by appending a numeric
// suffix. Idempotent — a second run finds nothing left to backfill.
async function backfillLogins(pool: Pool): Promise<void> {
  const { rows: missing } = await pool.query(
    'SELECT id, email FROM users WHERE login IS NULL ORDER BY created_at ASC'
  )
  if (missing.length === 0) return

  const { rows: existing } = await pool.query('SELECT LOWER(login) as login FROM users WHERE login IS NOT NULL')
  const taken = new Set<string>(existing.map((r: any) => r.login))

  for (const user of missing) {
    const base = loginFromEmail(user.email || '')
    let candidate = base
    let n = 2
    while (taken.has(candidate)) {
      candidate = `${base}${n}`
      n++
    }
    taken.add(candidate)
    await pool.query('UPDATE users SET login = $1 WHERE id = $2', [candidate, user.id])
  }
}

export async function migrateTenantDb(pool: Pool): Promise<void> {
  await pool.query(TENANT_SCHEMA_SQL)
  await backfillLogins(pool)
  await pool.query(ENFORCE_LOGIN_CONSTRAINT_SQL)
}
