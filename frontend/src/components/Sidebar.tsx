import { NavLink, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  AlertTriangle,
  Users,
  FileText,
  Receipt,
  BarChart2,
  Settings,
  UserCog,
  ShoppingCart,
  MapPin,
  Download,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAlertStore } from '../store/alertStore'
import { useSiteStore } from '../store/siteStore'
import api from '../services/api'
import { applyBranding } from '../utils/branding'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true, roles: ['superadmin', 'admin', 'vendeur', 'gestionnaire', 'comptable'] },
  { to: '/produits', label: 'Produits', icon: Package, roles: ['superadmin', 'admin', 'gestionnaire', 'vendeur'] },
  { to: '/stock', label: 'Mouvements stock', icon: ArrowLeftRight, roles: ['superadmin', 'admin', 'gestionnaire'] },
  { to: '/alertes', label: 'Alertes stock', icon: AlertTriangle, roles: ['superadmin', 'admin', 'gestionnaire'], badge: true },
  { to: '/clients', label: 'Clients & Fourn.', icon: Users, roles: ['superadmin', 'admin', 'vendeur', 'gestionnaire', 'comptable'] },
  { to: '/ventes', label: 'Ventes', icon: ShoppingCart, roles: ['superadmin', 'admin', 'vendeur', 'comptable'] },
  { to: '/devis', label: 'Devis', icon: FileText, roles: ['superadmin', 'admin', 'vendeur'] },
  { to: '/factures', label: 'Factures', icon: Receipt, roles: ['superadmin', 'admin', 'vendeur', 'comptable'] },
  { to: '/synthese', label: 'Synthèse stock', icon: ClipboardList, roles: ['superadmin', 'admin', 'gestionnaire', 'comptable'] },
  { to: '/rapports', label: 'Rapports', icon: BarChart2, roles: ['superadmin', 'admin', 'comptable', 'gestionnaire', 'vendeur'] },
  { to: '/parametres', label: 'Paramètres', icon: Settings, roles: ['superadmin', 'admin'] },
  { to: '/sites', label: 'Magasins', icon: MapPin, roles: ['superadmin', 'admin'] },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: UserCog, roles: ['superadmin', 'admin'] },
]

const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrateur',
  vendeur: 'Vendeur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
}

export default function Sidebar() {
  const { user } = useAuthStore()
  const { alertCount } = useAlertStore()
  const { sites, currentSiteId, setCurrentSiteId } = useSiteStore()
  const [company, setCompany] = useState<{ name: string; logo_url: string }>({ name: '', logo_url: '' })
  const [installPrompt, setInstallPrompt] = useState<any>(null)

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    api.get('/settings').then((r) => {
      if (r.data) {
        setCompany({ name: r.data.name || '', logo_url: r.data.logo_url || '' })
        applyBranding({ name: r.data.name, logo_url: r.data.logo_url, primary_color: r.data.primary_color })
      }
    }).catch(() => {})
  }, [])

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  )

  const logoSrc = company.logo_url
    ? company.logo_url.startsWith('http') ? company.logo_url : `${API_URL}${company.logo_url}`
    : ''

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_URL}${user.avatar_url}`)
    : ''

  const initials = user?.name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
      {/* Company branding */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {logoSrc ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm">
              <img
                src={logoSrc}
                alt="Logo"
                className="max-w-full max-h-full object-contain p-0.5"
                onError={(e) => {
                  const img = e.target as HTMLImageElement
                  img.onerror = null
                  img.src = '/logo.png'
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm">
              <img src="/logo.png" alt="StockApp" className="max-w-full max-h-full object-contain p-0.5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-tight truncate">
              {company.name || (
                <>Stock<span style={{ color: 'var(--brand-primary)' }}>App</span></>
              )}
            </h1>
            <p className="text-gray-400 text-xs truncate">Gestion de stock</p>
          </div>
        </div>
      </div>

      {/* Site selector */}
      {(sites.length > 1 || user?.role === 'superadmin') && (
        <div className="px-4 py-3 border-b border-gray-800">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 block">Magasin actif</label>
          <select
            value={currentSiteId || ''}
            onChange={(e) => { setCurrentSiteId(e.target.value); window.location.reload() }}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer"
          >
            {user?.role === 'superadmin' && (
              <option value="all">🌐 Tous les magasins</option>
            )}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {visibleItems.map(({ to, label, icon: Icon, exact, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {badge && alertCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {alertCount}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Platform admin panel — separate multi-tenant panel, gated by its own token (PLATFORM_ADMIN_TOKEN), shown to admins as an entry point */}
      {(user?.role === 'superadmin' || user?.role === 'admin') && (
        <div className="px-3 pb-2">
          <Link
            to="/super-admin"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
          >
            <ShieldCheck size={16} />
            Panneau plateforme
          </Link>
        </div>
      )}

      {/* Install app button */}
      {installPrompt && (
        <div className="px-3 pb-2">
          <button
            onClick={async () => {
              installPrompt.prompt()
              const result = await installPrompt.userChoice
              if (result.outcome === 'accepted') setInstallPrompt(null)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download size={16} />
            Installer sur le bureau
          </button>
        </div>
      )}

      {/* User profile */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="Avatar"
              className="w-9 h-9 rounded-full object-cover border-2 border-gray-700 shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-xs font-bold shadow-md shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-gray-400">{roleLabels[user?.role || ''] || user?.role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
