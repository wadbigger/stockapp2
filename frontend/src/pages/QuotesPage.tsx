import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Edit2, FileDown, CheckCircle, ArrowRight, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { toast } from '../components/Toast'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate } from '../utils/format'
import { quoteStatusLabel, quoteStatusColor } from '../utils/statusLabels'
import type { Quote, PaginatedResponse, QuoteStatus } from '../types'
import { useSiteStore } from '../store/siteStore'

const statusTransitions: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  brouillon: ['envoye'],
  envoye: ['accepte', 'refuse'],
  accepte: [],
  refuse: [],
  expire: [],
}


export default function QuotesPage() {
  const { currentSiteId } = useSiteStore()
  const [data, setData] = useState<PaginatedResponse<Quote>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [convertConfirm, setConvertConfirm] = useState<Quote | null>(null)
  const navigate = useNavigate()

  const fetchQuotes = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20', search })
    if (filterStatus) params.set('status', filterStatus)
    const res = await api.get(`/quotes?${params}`)
    setData(res.data)
  }, [page, search, filterStatus, currentSiteId])

  useEffect(() => { fetchQuotes() }, [fetchQuotes])

  const downloadPDF = async (q: Quote) => {
    try {
      const res = await api.get(`/quotes/${q.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${q.number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors du téléchargement')
    }
  }

  const changeStatus = async (q: Quote, status: QuoteStatus) => {
    try {
      await api.patch(`/quotes/${q.id}/status`, { status })
      toast.success('Statut mis à jour')
      fetchQuotes()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  const convertToInvoice = async (q: Quote) => {
    try {
      const res = await api.post(`/quotes/${q.id}/convert`)
      toast.success('Facture créée depuis le devis')
      navigate(`/factures/${res.data.id}/modifier`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  const statuses: QuoteStatus[] = ['brouillon', 'envoye', 'accepte', 'refuse', 'expire']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher numéro, client…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
          <option value="">Tous les statuts</option>
          {statuses.map((s) => <option key={s} value={s}>{quoteStatusLabel[s]}</option>)}
        </select>
        <button onClick={() => navigate('/devis/nouveau')} className="btn-primary">
          <Plus size={16} />
          Nouveau devis
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Date</th>
              <th>Validité</th>
              <th>Total TTC</th>
              <th>Statut</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun devis</td></tr>
            ) : (
              data.data.map((q) => (
                <tr key={q.id}>
                  <td className="font-mono text-sm font-semibold text-primary-700">{q.number}</td>
                  <td>
                    <p className="font-medium">{q.client_name}</p>
                    {q.client_company && <p className="text-xs text-gray-400">{q.client_company}</p>}
                  </td>
                  <td className="text-gray-500 text-sm">{formatDate(q.created_at)}</td>
                  <td className="text-gray-500 text-sm">{formatDate(q.validity_date)}</td>
                  <td className="font-semibold">{formatCurrency(q.total_ttc)}</td>
                  <td>
                    <span className={`badge ${quoteStatusColor[q.status]}`}>{quoteStatusLabel[q.status]}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {q.status === 'brouillon' && (
                        <button onClick={() => navigate(`/devis/${q.id}/modifier`)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Modifier">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {statusTransitions[q.status]?.includes('envoye' as QuoteStatus) && (
                        <button onClick={() => changeStatus(q, 'envoye')} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Marquer envoyé">
                          <ArrowRight size={14} />
                        </button>
                      )}
                      {q.status === 'envoye' && (
                        <>
                          <button onClick={() => changeStatus(q, 'accepte')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Accepter">
                            <CheckCircle size={14} />
                          </button>
                        </>
                      )}
                      {q.status === 'accepte' && (
                        <button onClick={() => setConvertConfirm(q)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Convertir en facture">
                          <Eye size={14} />
                        </button>
                      )}
                      <button onClick={() => downloadPDF(q)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Télécharger PDF">
                        <FileDown size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        isOpen={!!convertConfirm}
        onClose={() => setConvertConfirm(null)}
        onConfirm={() => convertConfirm && convertToInvoice(convertConfirm)}
        title="Convertir en facture"
        message={`Convertir le devis ${convertConfirm?.number} en facture ?`}
        confirmLabel="Convertir"
        variant="primary"
      />
    </div>
  )
}
