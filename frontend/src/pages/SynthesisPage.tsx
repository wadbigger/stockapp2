import { useEffect, useState, useCallback } from 'react'
import { FileDown, RefreshCw, Calendar } from 'lucide-react'
import api from '../services/api'
import { useSiteStore } from '../store/siteStore'
import { today, addDays } from '../utils/format'

interface SynthRow {
  name: string
  unit: string
  stock_initial: number
  approv: number
  ecart: number
  ventes: number
  sorties: number
  stock_final: number
}

interface SynthData {
  categories: Record<string, SynthRow[]>
  siteName: string
  company: { name: string }
  date_from: string
  date_to: string
}

export default function SynthesisPage() {
  const [data, setData] = useState<SynthData | null>(null)
  const [dateFrom, setDateFrom] = useState(addDays(today(), -7))
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(false)
  const { currentSiteId } = useSiteStore()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/reports/synthesis?date_from=${dateFrom}&date_to=${dateTo}`)
      setData(res.data)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, currentSiteId])

  useEffect(() => { fetchData() }, [fetchData])

  const downloadPDF = async () => {
    try {
      const res = await api.get(`/reports/synthesis/pdf?date_from=${dateFrom}&date_to=${dateTo}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `synthese_${dateFrom}_${dateTo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const fmtDate = (d: string) => {
    const p = d.split('-')
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
  }

  const categories = data?.categories || {}
  const allRows = Object.values(categories).flat()
  const totals = {
    stock_initial: allRows.reduce((s, r) => s + r.stock_initial, 0),
    approv: allRows.reduce((s, r) => s + r.approv, 0),
    ecart: allRows.reduce((s, r) => s + r.ecart, 0),
    ventes: allRows.reduce((s, r) => s + r.ventes, 0),
    sorties: allRows.reduce((s, r) => s + r.sorties, 0),
    stock_final: allRows.reduce((s, r) => s + r.stock_final, 0),
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Calendar size={14} className="text-gray-400" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm border-none outline-none bg-transparent" />
          <span className="text-gray-400 text-xs">au</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm border-none outline-none bg-transparent" />
        </div>
        <button onClick={fetchData} disabled={loading} className="btn-secondary py-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
        <button onClick={downloadPDF} className="btn-primary py-2">
          <FileDown size={14} />
          Exporter PDF
        </button>
        {data && (
          <span className="ml-auto text-sm font-semibold text-primary-700 bg-primary-50 px-3 py-1.5 rounded-lg">
            {data.siteName}
          </span>
        )}
      </div>

      {/* Header */}
      {data && (
        <div className="text-center py-2">
          <h2 className="text-lg font-bold text-gray-900">TABLEAU DE SYNTHESE PAR MAGASIN</h2>
          <p className="text-sm text-gray-500">
            {data.company?.name} — Du {fmtDate(dateFrom)} au {fmtDate(dateTo)}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th rowSpan={2} className="text-left px-3 py-2 border-r border-gray-300 font-semibold min-w-[200px]">PRODUITS</th>
              <th rowSpan={2} className="px-2 py-2 border-r border-gray-300 font-semibold w-16 text-center">Stock<br/>Initial (A)</th>
              <th colSpan={3} className="px-2 py-1 border-r border-gray-300 font-semibold text-center bg-green-50 text-green-800">Entrées de stocks (B)</th>
              <th colSpan={3} className="px-2 py-1 border-r border-gray-300 font-semibold text-center bg-red-50 text-red-800">Sorties de stocks (C)</th>
              <th rowSpan={2} className="px-2 py-2 font-semibold w-20 text-center bg-blue-50 text-blue-800">Stock<br/>Final<br/>(A+B-C)</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-300 text-xs">
              <th className="px-2 py-1.5 border-r border-gray-200 text-center bg-green-50 text-green-700 w-14">Approv.</th>
              <th className="px-2 py-1.5 border-r border-gray-200 text-center bg-green-50 text-green-700 w-14">Récep.</th>
              <th className="px-2 py-1.5 border-r border-gray-300 text-center bg-green-50 text-green-700 w-14">Ecart<br/>d'invent.</th>
              <th className="px-2 py-1.5 border-r border-gray-200 text-center bg-red-50 text-red-700 w-14">Ventes</th>
              <th className="px-2 py-1.5 border-r border-gray-200 text-center bg-red-50 text-red-700 w-14">Retour/<br/>Annulat.</th>
              <th className="px-2 py-1.5 border-r border-gray-300 text-center bg-red-50 text-red-700 w-14">Exp.</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).map(([catName, products]) => (
              <>{/* Category header */}
                <tr key={`cat-${catName}`} className="bg-gray-50">
                  <td colSpan={9} className="px-3 py-1.5 font-bold text-gray-700 text-xs uppercase tracking-wide border-b border-gray-200">{catName}</td>
                </tr>
                {products.map((p, idx) => (
                  <tr key={`${catName}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 border-r border-gray-200 text-gray-800">{p.name}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center font-medium">{p.stock_initial || ''}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-green-700">{p.approv || ''}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-green-700"></td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-green-700">{p.ecart || ''}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-red-600 font-medium">{p.ventes || ''}</td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-red-600"></td>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center text-red-600">{p.sorties || ''}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-blue-700">{p.stock_final}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-gray-400 font-bold text-sm">
              <td className="px-3 py-2 border-r border-gray-300">TOTAUX</td>
              <td className="px-2 py-2 border-r border-gray-300 text-center">{totals.stock_initial}</td>
              <td className="px-2 py-2 border-r border-gray-200 text-center text-green-700">{totals.approv || ''}</td>
              <td className="px-2 py-2 border-r border-gray-200 text-center"></td>
              <td className="px-2 py-2 border-r border-gray-300 text-center text-green-700">{totals.ecart || ''}</td>
              <td className="px-2 py-2 border-r border-gray-200 text-center text-red-600">{totals.ventes || ''}</td>
              <td className="px-2 py-2 border-r border-gray-200 text-center"></td>
              <td className="px-2 py-2 border-r border-gray-300 text-center text-red-600">{totals.sorties || ''}</td>
              <td className="px-2 py-2 text-center font-bold text-blue-700">{totals.stock_final}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Control */}
      {data && (
        <div className="flex justify-center gap-12 py-3">
          <div className="text-center">
            <span className="text-sm font-bold text-gray-700">CONTROLE</span>
            <span className="ml-3 text-lg font-bold text-primary-700">{totals.stock_final.toFixed(2)}</span>
          </div>
          <div className="text-center">
            <span className="text-sm font-bold text-gray-700">DIFF</span>
            <span className={`ml-3 text-lg font-bold ${(totals.stock_final - (totals.stock_initial + totals.approv + totals.ecart - totals.ventes - totals.sorties)) === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {(totals.stock_final - (totals.stock_initial + totals.approv + totals.ecart - totals.ventes - totals.sorties)).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8 text-gray-400">Chargement...</div>}
      {!loading && allRows.length === 0 && data && (
        <div className="text-center py-8 text-gray-400">Aucun produit trouvé pour cette période</div>
      )}
    </div>
  )
}
