import { AsyncLocalStorage } from 'async_hooks'
import { Pool } from 'pg'

export interface TenantStore {
  pool: Pool
  tenantId: string
  slug: string
}

const als = new AsyncLocalStorage<TenantStore>()

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return als.run(store, fn)
}

export function getCurrentTenant(): TenantStore {
  const store = als.getStore()
  if (!store) {
    throw new Error('No tenant context active — this code path ran outside an authenticated tenant request')
  }
  return store
}
