import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp,
  ShoppingCart,
  CreditCard,
  Package,
  AlertCircle,
  Search,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Users,
  Calendar,
  Plus,
  FileText,
} from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import { formatCurrency, formatDate, today, addDays } from '../utils/format'
import { invoiceStatusLabel, invoiceStatusColor } from '../utils/statusLabels'
import { useSiteStore } from '../store/siteStore'
import type { InvoiceStatus } from '../types'
import { useNavigate } from 'react-router-dom'

interface SalesKPIs {
  ca_total: number
  nb_ventes: number
  total_encaisse: number
  total_articles: number
  total_impaye: number
}

interface SaleRow {
  id: string
  number: string
  status: InvoiceStatus
  issue_date: string
  subtotal_ht: string
  total_tva: string
  total_ttc: string
  amount_paid: string
  payment_method: string
  client_name: string
  client_company: string
  vendeur_name: string
  nb_lignes: number
  total_articles: number
}

interface TopProduct {
  id: string
  name: string
  sku: string
  sale_price: string
  total_qty: string
  total_ht: string
}

interface TopClient {
  id: string
  name: string
  company: string
  nb_factures: string
  total_ttc: string
}

interface DailyData {
  date: string
  nb: string
  total: string
}

type PeriodKey = '7j' | '30j' | '90j' | '365j' | 'custom'

export default function SalesPage() {
  const navigate = useNavigate()
  const { currentSiteId } = useSiteStore()
  const [kpis, setKpis] = useState<SalesKPIs>({ ca_total: 0, nb_ventes: 0, total_encaisse: 0, total_articles: 0, total_impaye: 0 })
  const [sales, setSales] = useState<SaleRow[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topClients, setTopClients] = useState<TopClient[]>([])
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<PeriodKey>('30j')
  const [dateFrom, setDateFrom] = useState(addDays(today(), -30))
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(true)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const limit = 15

  const getDateRange = useCallback(() => {
    if (period === 'custom') return { from: dateFrom, to: dateTo }
    const days: Record<string, number> = { '7j': -7, '30j': -30, '90j': -90, '365j': -365 }
    return { from: addDays(today(), days[period] || -30), to: today() }
  }, [period, dateFrom, dateTo])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { from, to } = getDateRange()
    const dateParams = `date_from=${from}&date_to=${to}`
    try {
      const [kpiRes, salesRes, topProdRes, topClientRes, dailyRes] = await Promise.all([
        api.get(`/sales/kpis?${dateParams}`),
        api.get(`/sales?${dateParams}&search=${search}&page=${page}&limit=${limit}&sort=issue_date&order=desc`),
        api.get(`/sales/top-products?${dateParams}&limit=5`),
        api.get(`/sales/top-clients?${dateParams}&limit=5`),
        api.get(`/sales/daily?${dateParams}`),
      ])
      setKpis(kpiRes.data)
      setSales(salesRes.data.data)
      setTotal(salesRes.data.total)
      setTopProducts(topProdRes.data)
      setTopClients(topClientRes.data)
      setDailyData(dailyRes.data)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [getDateRange, search, page, currentSiteId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => { setPage(1) }, [period, dateFrom, dateTo, search])

  const totalPages = Math.ceil(total / limit)

  const maxDailyTotal = Math.max(...dailyData.map((d) => parseFloat(d.total) || 0), 1)

  const exportCSV = async () => {
    const { from, to } = getDateRange()
    try {
      const res = await api.get(`/sales?date_from=${from}&date_to=${to}&limit=10000`)
      const rows = res.data.data as SaleRow[]
      const header = 'N° Facture;Date;Client;Montant HT;TVA;Total TTC;Payé;Statut;Vendeur\n'
      const csv = rows.map((r) =>
        `${r.number};${formatDate(r.issue_date)};${r.client_name || ''};${r.subtotal_ht};${r.total_tva};${r.total_ttc};${r.amount_paid};${invoiceStatusLabel[r.status]};${r.vendeur_name || ''}`
      ).join('\n')
      const blob = new Blob(['\ufeff' + header + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ventes_${from}_${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  return (
    <div className="space-y-6">
      {/* Header with new sale button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ventes</h1>
          <p className="text-sm text-gray-500">Suivi des ventes et statistiques commerciales</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setLoadingPdf(true)
              try {
                const d = today()
                const res = await api.get(`/reports/daily-sales/pdf?date=${d}`, { responseType: 'blob' })
                if (res.status !== 200) {
                  const text = await res.data.text()
                  const err = JSON.parse(text || '{}').message || 'Erreur serveur'
                  toast.error(err)
                  return
                }
                const url = URL.createObjectURL(res.data)
                const a = document.createElement('a')
                a.href = url
                a.download = `ventes_journalieres_${d}.pdf`
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 200)
                toast.success('Fiche téléchargée')
              } catch (e: any) {
                let msg = 'Erreur lors du téléchargement'
                if (e.response?.data) {
                  if (e.response.data instanceof Blob) {
                    try {
                      const text = await e.response.data.text()
                      const parsed = JSON.parse(text || '{}')
                      msg = parsed.message || msg
                    } catch {}
                  } else if (typeof e.response.data?.message === 'string') {
                    msg = e.response.data.message
                  }
                } else if (e.message) msg = e.message
                toast.error(msg)
              } finally {
                setLoadingPdf(false)
              }
            }}
            disabled={loadingPdf}
            className="btn-secondary py-2.5"
          >
            <FileText size={16} />
            {loadingPdf ? 'Génération…' : 'Fiche ventes journalières'}
          </button>
          <button onClick={() => navigate('/rapports')} className="btn-secondary py-2.5" title="Tous les rapports">
            <Download size={16} />
            Rapports
          </button>
          <button onClick={() => navigate('/ventes/nouvelle')} className="btn-primary py-2.5">
            <Plus size={16} />
            Nouvelle vente
          </button>
        </div>
      </div>

      {/* Period filter */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Période :</span>
          {(['7j', '30j', '90j', '365j', 'custom'] as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === '7j' ? '7 jours' : p === '30j' ? '30 jours' : p === '90j' ? '3 mois' : p === '365j' ? '1 an' : 'Personnalisé'}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input py-1.5 text-sm w-auto" />
              <span className="text-gray-400">→</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input py-1.5 text-sm w-auto" />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={TrendingUp} label="Chiffre d'affaires" value={formatCurrency(kpis.ca_total)} color="blue" />
        <KPICard icon={ShoppingCart} label="Nombre de ventes" value={String(kpis.nb_ventes)} color="green" />
        <KPICard icon={CreditCard} label="Total encaissé" value={formatCurrency(kpis.total_encaisse)} color="emerald" />
        <KPICard icon={Package} label="Articles vendus" value={String(Math.round(kpis.total_articles))} color="purple" />
        <KPICard icon={AlertCircle} label="Impayés" value={formatCurrency(kpis.total_impaye)} color="red" />
      </div>

      {/* Middle row: chart + tops */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily chart */}
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold text-gray-800 mb-4">Ventes journalières</h3>
          {dailyData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune donnée sur la période</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {dailyData.map((d) => {
                const pct = (parseFloat(d.total) / maxDailyTotal) * 100
                return (
                  <div key={d.date} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-gray-500 text-xs shrink-0">{formatDate(d.date)}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full flex items-center px-2 min-w-fit"
                        style={{ width: `${Math.max(pct, 8)}%` }}
                      >
                        <span className="text-[10px] text-white font-medium whitespace-nowrap">{formatCurrency(d.total)}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-12 text-right shrink-0">{d.nb} vt.</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top products + clients */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-amber-500" />
              <h3 className="font-semibold text-gray-800 text-sm">Top Produits</h3>
            </div>
            {topProducts.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Aucune vente</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-gray-200 text-gray-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-800">{Math.round(parseFloat(p.total_qty))} u.</p>
                      <p className="text-xs text-gray-400">{formatCurrency(p.total_ht)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-primary-500" />
              <h3 className="font-semibold text-gray-800 text-sm">Top Clients</h3>
            </div>
            {topClients.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Aucune vente</p>
            ) : (
              <div className="space-y-2">
                {topClients.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                      {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-800">{formatCurrency(c.total_ttc)}</p>
                      <p className="text-xs text-gray-400">{c.nb_factures} fact.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sales table */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-gray-800">Détail des ventes</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="input pl-9 py-2 text-sm w-60"
              />
            </div>
            <button onClick={exportCSV} className="btn-secondary py-2 text-sm">
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Chargement…</div>
        ) : sales.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Aucune vente sur cette période</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>N° Facture</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Vendeur</th>
                    <th>Articles</th>
                    <th className="text-right">Total TTC</th>
                    <th className="text-right">Payé</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="font-mono text-sm font-medium text-primary-700">{s.number}</td>
                      <td className="text-sm text-gray-600">{formatDate(s.issue_date)}</td>
                      <td>
                        <p className="text-sm font-medium text-gray-800">{s.client_name || '—'}</p>
                        {s.client_company && <p className="text-xs text-gray-400">{s.client_company}</p>}
                      </td>
                      <td className="text-sm text-gray-600">{s.vendeur_name || '—'}</td>
                      <td className="text-sm text-gray-600">{Math.round(s.total_articles || 0)}</td>
                      <td className="text-right text-sm font-semibold text-gray-800">{formatCurrency(s.total_ttc)}</td>
                      <td className="text-right text-sm text-gray-600">{formatCurrency(s.amount_paid)}</td>
                      <td>
                        <span className={`badge ${invoiceStatusColor[s.status]}`}>
                          {invoiceStatusLabel[s.status]}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => navigate(`/factures/${s.id}/modifier`)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Voir la facture"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{total} vente{total > 1 ? 's' : ''} au total</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-gray-600 px-3">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function KPICard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color] || colorMap.blue}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-800 leading-tight truncate">{value}</p>
      </div>
    </div>
  )
}
