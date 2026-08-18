import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Users,
  CircleDollarSign,
  ShieldCheck,
  LogOut,
  Plus,
  Settings,
  DatabaseBackup,
  Lock,
  Unlock,
  Search,
  ChevronRight,
} from 'lucide-react'
import platformApi from '../../services/platformApi'
import { usePlatformStore } from '../../store/platformStore'
import { toast } from '../../components/Toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import CreateTenantModal from './CreateTenantModal'
import PlansModal from './PlansModal'
import TenantDetailModal from './TenantDetailModal'
import type { PlatformTenant, PlatformPlan, PlatformStats } from '../../types/platform'

function formatMoney(amount: number, currency = 'FCFA'): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + currency
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const tenantStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  provisioning: 'bg-blue-100 text-blue-700',
  failed: 'bg-gray-200 text-gray-600',
}

const subStatusColors: Record<string, string> = {
  trialing: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-gray-200 text-gray-600',
}

export default function PlatformDashboardPage() {
  const navigate = useNavigate()
  const { clearToken } = usePlatformStore()
  const [tenants, setTenants] = useState<PlatformTenant[]>([])
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenant | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [toggleTarget, setToggleTarget] = useState<PlatformTenant | null>(null)
  const [backupLoadingId, setBackupLoadingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tenantsRes, plansRes, statsRes] = await Promise.all([
        platformApi.get('/tenants'),
        platformApi.get('/plans'),
        platformApi.get('/stats'),
      ])
      setTenants(tenantsRes.data)
      setPlans(plansRes.data)
      setStats(statsRes.data)
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        clearToken()
        navigate('/super-admin/login')
      } else {
        toast.error('Erreur lors du chargement du panneau plateforme')
      }
    } finally {
      setLoading(false)
    }
  }, [clearToken, navigate])

  useEffect(() => { loadAll() }, [loadAll])

  const logout = () => {
    clearToken()
    navigate('/super-admin/login')
  }

  const quickBackup = async (tenant: PlatformTenant) => {
    setBackupLoadingId(tenant.id)
    try {
      await platformApi.post(`/tenants/${tenant.id}/backup`)
      toast.success(`Sauvegarde lancée pour ${tenant.name}`)
      loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la sauvegarde')
    } finally {
      setBackupLoadingId(null)
    }
  }

  const toggleSuspend = async () => {
    if (!toggleTarget) return
    const newStatus = toggleTarget.status === 'suspended' ? 'active' : 'suspended'
    try {
      await platformApi.patch(`/tenants/${toggleTarget.id}`, { status: newStatus })
      toast.success(newStatus === 'suspended' ? 'Tenant suspendu' : 'Tenant réactivé')
      loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la mise à jour')
    }
  }

  const filteredTenants = tenants.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false
    if (search && !`${t.name} ${t.slug}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const mrrTotal = stats?.mrr.reduce((sum, m) => sum + m.amount, 0) || 0
  const mrrCurrency = stats?.mrr[0]?.currency || 'FCFA'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">Panneau plateforme StockApp</h1>
              <p className="text-gray-400 text-xs">Administration multi-tenant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPlansOpen(true)} className="btn-secondary py-2 text-sm bg-transparent border-gray-700 text-gray-200 hover:bg-gray-800">
              <Settings size={14} />
              Plans
            </button>
            <button onClick={() => setCreateOpen(true)} className="btn-primary py-2 text-sm">
              <Plus size={14} />
              Nouveau tenant
            </button>
            <button onClick={logout} className="btn-secondary py-2 text-sm bg-transparent border-gray-700 text-gray-200 hover:bg-gray-800">
              <LogOut size={14} />
              Quitter
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={Building2} label="Tenants actifs" value={String(stats?.tenants.byStatus.active || 0)} sub={`${stats?.tenants.total || 0} au total`} color="blue" />
          <KPICard icon={Lock} label="Suspendus" value={String(stats?.tenants.byStatus.suspended || 0)} sub="Comptes bloqués" color="red" />
          <KPICard icon={Users} label="Abonnements actifs" value={String(stats?.subscriptions.byStatus.active || 0)} sub={`${stats?.subscriptions.byStatus.trialing || 0} en essai`} color="purple" />
          <KPICard icon={CircleDollarSign} label="MRR" value={formatMoney(mrrTotal, mrrCurrency)} sub="Revenu mensuel récurrent" color="emerald" />
        </div>

        {/* Filters */}
        <div className="card flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un tenant…"
              className="input pl-9"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="suspended">Suspendu</option>
            <option value="provisioning">En provisioning</option>
            <option value="failed">Échoué</option>
          </select>
        </div>

        <p className="text-xs text-gray-400 -mb-2">
          Cliquez sur un tenant ou sur « Détails » pour gérer son abonnement, consulter ses sauvegardes et <strong>restaurer</strong> une sauvegarde.
        </p>

        {/* Tenants table */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Chargement…</div>
          ) : filteredTenants.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">Aucun tenant</div>
          ) : (
            <div className="table-container border-0 rounded-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Statut</th>
                    <th>Abonnement</th>
                    <th className="text-right">MRR</th>
                    <th>Dernier backup</th>
                    <th>Créé le</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="cursor-pointer" onClick={() => setSelectedTenant(t)}>
                      <td>
                        <p className="font-medium text-gray-800">{t.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                      </td>
                      <td>
                        <span className={`badge ${tenantStatusColors[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                      </td>
                      <td>
                        {t.subscription_status ? (
                          <span className={`badge ${subStatusColors[t.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                            {t.plan_name || 'Sans plan'} · {t.subscription_status}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="text-right text-sm font-medium text-gray-700">
                        {t.subscription_status === 'active' ? formatMoney(parseFloat(t.amount_monthly || '0'), t.currency || 'FCFA') : '—'}
                      </td>
                      <td className="text-sm text-gray-500">{t.last_backup_at ? formatDate(t.last_backup_at) : 'Jamais'}</td>
                      <td className="text-sm text-gray-500">{formatDate(t.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => quickBackup(t)}
                            disabled={backupLoadingId === t.id}
                            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-40"
                            title="Forcer un backup"
                          >
                            <DatabaseBackup size={16} />
                          </button>
                          <button
                            onClick={() => setToggleTarget(t)}
                            className={`p-1.5 rounded-lg ${t.status === 'suspended' ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                            title={t.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
                          >
                            {t.status === 'suspended' ? <Unlock size={16} /> : <Lock size={16} />}
                          </button>
                          <button
                            onClick={() => setSelectedTenant(t)}
                            className="inline-flex items-center gap-1 pl-2 pr-1.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg"
                            title="Voir le détail (abonnement, sauvegardes, restauration…)"
                          >
                            Détails
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <CreateTenantModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadAll} />
      <PlansModal isOpen={plansOpen} onClose={() => setPlansOpen(false)} plans={plans} onChanged={loadAll} />
      <TenantDetailModal tenant={selectedTenant} plans={plans} onClose={() => setSelectedTenant(null)} onChanged={loadAll} />

      <ConfirmDialog
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={toggleSuspend}
        title={toggleTarget?.status === 'suspended' ? 'Réactiver le tenant' : 'Suspendre le tenant'}
        message={
          toggleTarget?.status === 'suspended'
            ? `Réactiver l'accès de "${toggleTarget?.name}" ? Les utilisateurs pourront de nouveau se connecter.`
            : `Suspendre "${toggleTarget?.name}" ? Tous les utilisateurs de ce tenant seront immédiatement déconnectés et ne pourront plus se connecter.`
        }
        confirmLabel={toggleTarget?.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
        variant={toggleTarget?.status === 'suspended' ? 'primary' : 'danger'}
      />
    </div>
  )
}

function KPICard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color] || colorMap.blue}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-800 leading-tight truncate">{value}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </div>
  )
}
