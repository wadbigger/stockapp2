export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'failed'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface PlatformTenant {
  id: string
  slug: string
  name: string
  db_name: string
  status: TenantStatus
  display_name: string
  logo_url: string
  primary_color: string
  created_at: string
  subscription_status: SubscriptionStatus | null
  amount_monthly: string | null
  currency: string | null
  current_period_end: string | null
  plan_id: string | null
  plan_name: string | null
  last_backup_at: string | null
}

export interface PlatformBackup {
  id: string
  filename: string
  size_bytes: number
  status: 'completed' | 'failed'
  triggered_by: string
  created_at: string
}

export interface PlatformPlan {
  id: string
  name: string
  price_monthly: string
  currency: string
  active: boolean
  created_at: string
}

export interface PlatformSubscription {
  id: string
  tenant_id: string
  plan_id: string | null
  plan_name: string | null
  status: SubscriptionStatus
  amount_monthly: string
  currency: string
  started_at: string
  current_period_end: string | null
  canceled_at: string | null
}

export interface PlatformAuditEntry {
  id: string
  tenant_id: string | null
  tenant_name?: string
  action: string
  details: string
  created_at: string
}

export interface PlatformStats {
  tenants: {
    total: number
    byStatus: Record<string, number>
  }
  subscriptions: {
    byStatus: Record<string, number>
  }
  mrr: { currency: string; amount: number }[]
  backups: {
    last24h: number
    failedLast7d: number
  }
}
