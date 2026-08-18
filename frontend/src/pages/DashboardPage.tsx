import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import { formatCurrency } from '../utils/format'
import { invoiceStatusLabel, invoiceStatusColor } from '../utils/statusLabels'
import { useSiteStore } from '../store/siteStore'
import type { DashboardKPIs, SalesData, Invoice, Product } from '../types'

type Period = 'semaine' | 'mois' | 'trimestre' | 'annee'

const periodLabels: Record<Period, string> = {
  semaine: 'Cette semaine',
  mois: 'Ce mois',
  trimestre: 'Ce trimestre',
  annee: 'Cette année',
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('mois')
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [alertProducts, setAlertProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { currentSiteId, sites } = useSiteStore()
  const currentSite = sites.find((s) => s.id === currentSiteId)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [kpiRes, salesRes, invRes, alertRes] = await Promise.all([
        api.get(`/dashboard/kpis?period=${period}`),
        api.get('/dashboard/sales'),
        api.get('/invoices?limit=5&sort=created_at&order=desc'),
        api.get('/products?alert=true&limit=10'),
      ])
      setKpis(kpiRes.data)
      setSalesData(salesRes.data)
      setRecentInvoices(invRes.data.data || [])
      setAlertProducts(alertRes.data.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [period, currentSiteId])

  const kpiCards = [
    {
      label: "Chiffre d'affaires",
      value: kpis ? formatCurrency(kpis.ca_mois) : '—',
      icon: TrendingUp,
      color: 'bg-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Factures émises',
      value: kpis?.factures_emises ?? '—',
      icon: Receipt,
      color: 'bg-green-500',
      bg: 'bg-green-50',
    },
    {
      label: 'Produits en alerte',
      value: kpis?.produits_alerte ?? '—',
      icon: AlertTriangle,
      color: 'bg-red-500',
      bg: 'bg-red-50',
    },
    {
      label: 'Factures en attente',
      value: kpis?.factures_attente ?? '—',
      icon: Clock,
      color: 'bg-orange-500',
      bg: 'bg-orange-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Site header */}
      {(currentSite || currentSiteId === 'all') && (
        <div className={`flex items-center gap-3 ${currentSiteId === 'all' ? 'bg-gradient-to-r from-purple-600 to-purple-500' : 'bg-gradient-to-r from-primary-600 to-primary-500'} text-white rounded-xl px-5 py-4 shadow-sm`}>
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">
              {currentSiteId === 'all' ? 'Tous les magasins' : currentSite?.name}
            </h1>
            {currentSiteId === 'all'
              ? <p className="text-sm text-white/75">Vue consolidée de tous les magasins</p>
              : currentSite?.address && <p className="text-sm text-white/75">{currentSite.address}</p>
            }
          </div>
          {sites.length > 1 && (
            <span className="ml-auto text-xs bg-white/20 px-2.5 py-1 rounded-full">{sites.length} magasins</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === p
                  ? 'bg-primary-600 text-white font-medium'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        <button
          onClick={fetchData}
          className="btn-secondary py-1.5"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card flex items-start gap-4">
            <div className={`${bg} p-3 rounded-xl`}>
              <Icon size={22} className={color.replace('bg-', 'text-')} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? '…' : value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Ventes sur 12 mois</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={salesData}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={100} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#2563eb"
              strokeWidth={2}
              fill="url(#colorSales)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Dernières factures</h3>
            <button
              onClick={() => navigate('/factures')}
              className="text-sm text-primary-600 hover:underline"
            >
              Voir tout
            </button>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune facture</p>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                  onClick={() => navigate('/factures')}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{inv.number}</p>
                    <p className="text-xs text-gray-500">{inv.client_name || inv.client_company}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(inv.total_ttc)}</p>
                    <span className={`badge ${invoiceStatusColor[inv.status]}`}>
                      {invoiceStatusLabel[inv.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Alertes de stock bas</h3>
            <button
              onClick={() => navigate('/alertes')}
              className="text-sm text-primary-600 hover:underline"
            >
              Voir tout
            </button>
          </div>
          {alertProducts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucun produit en alerte
            </p>
          ) : (
            <div className="space-y-3">
              {alertProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{p.current_stock} {p.unit}</p>
                    <p className="text-xs text-gray-400">Seuil: {p.alert_threshold}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
