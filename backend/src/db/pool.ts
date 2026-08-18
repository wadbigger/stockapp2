import { getCurrentTenant } from './tenantContext'

// Proxy that transparently delegates to the current tenant's Pool, resolved
// per-request via AsyncLocalStorage in middleware/auth.ts. Every route file
// keeps calling `pool.query(...)`/`pool.connect()` exactly as before —
// only this file changed to make that mechanism tenant-aware.
const pool: Pick<import('pg').Pool, 'query' | 'connect'> = {
  query: (...args: any[]) => (getCurrentTenant().pool.query as any)(...args),
  connect: (...args: any[]) => (getCurrentTenant().pool.connect as any)(...args),
}

export default pool
