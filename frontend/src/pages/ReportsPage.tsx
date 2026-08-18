import { useState } from 'react'
import { Download, FileSpreadsheet, Lock } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'

interface ExportConfig {
  id: string
  label: string
  description: string
  endpoint: string
  filename: string
  filters?: boolean
  dateOnly?: boolean
}

const exports: ExportConfig[] = [
  {
    id: 'invoices',
    label: 'Liste des factures',
    description: 'Export de toutes les factures avec leurs montants et statuts',
    endpoint: '/reports/invoices',
    filename: 'factures.xlsx',
    filters: true,
  },
  {
    id: 'stock',
    label: 'État du stock valorisé',
    description: 'Stock actuel × prix d\'achat par produit',
    endpoint: '/reports/stock',
    filename: 'stock.xlsx',
  },
  {
    id: 'vat',
    label: 'Rapport TVA collectée',
    description: 'TVA collectée sur les factures émises par période',
    endpoint: '/reports/vat',
    filename: 'tva.xlsx',
    filters: true,
  },
  {
    id: 'movements',
    label: 'Historique des mouvements',
    description: 'Tous les mouvements de stock (entrées, sorties, ventes)',
    endpoint: '/reports/movements',
    filename: 'mouvements.xlsx',
    filters: true,
  },
  {
    id: 'daily-sales',
    label: 'Ventes journalières',
    description: 'Rapport des ventes par jour. Affiche "Fiche de vente non valide" si la journée n\'est pas clôturée.',
    endpoint: '/reports/daily-sales/pdf',
    filename: 'ventes_journalieres.pdf',
    filters: true,
    dateOnly: true,
  },
]

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [closingDay, setClosingDay] = useState(false)

  const handleExport = async (config: ExportConfig) => {
    setLoading(config.id)
    try {
      const params = new URLSearchParams()
      if (config.filters) {
        if (config.dateOnly) {
          const d = dateFrom || dateTo || new Date().toISOString().slice(0, 10)
          params.set('date', d)
        } else {
          if (dateFrom) params.set('date_from', dateFrom)
          if (dateTo) params.set('date_to', dateTo)
        }
        if (status && config.id === 'invoices') params.set('status', status)
      }
      const res = await api.get(`${config.endpoint}?${params}`, { responseType: 'blob' })
      if (res.status !== 200) {
        const text = await res.data.text()
        const err = JSON.parse(text || '{}').message || 'Erreur serveur'
        toast.error(err)
        return
      }
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      const ext = config.filename.split('.').pop()
      const baseName = config.filename.replace(/\.[^/.]+$/, '')
      const d = config.dateOnly ? (dateFrom || dateTo || new Date().toISOString().slice(0, 10)) : null
      a.download = d ? `${baseName}_${d}.${ext}` : config.filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 200)
      toast.success('Export téléchargé')
    } catch (e: any) {
      let msg = 'Erreur lors de l\'export'
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text()
          const parsed = JSON.parse(text || '{}')
          msg = parsed.message || msg
        } catch {}
      } else if (e.response?.data?.message) msg = e.response.data.message
      toast.error(msg)
    } finally {
      setLoading(null)
    }
  }

  const handleCloseDay = async () => {
    const d = dateFrom || dateTo || new Date().toISOString().slice(0, 10)
    setClosingDay(true)
    try {
      await api.post('/sales/close-day', { date: d })
      toast.success('Journée clôturée')
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erreur lors de la clôture')
    } finally {
      setClosingDay(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Filtres (pour les exports avec période)</h3>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label">Date de début</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Date de fin</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Statut facture</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
              <option value="">Tous les statuts</option>
              <option value="brouillon">Brouillon</option>
              <option value="emise">Émise</option>
              <option value="partiellement_payee">Partiellement payée</option>
              <option value="payee">Payée</option>
              <option value="annulee">Annulée</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exports.map((exp) => (
          <div key={exp.id} className="card flex items-start gap-4">
            <div className="bg-green-50 p-3 rounded-xl shrink-0">
              <FileSpreadsheet size={22} className="text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-800">{exp.label}</h4>
              <p className="text-sm text-gray-500 mt-0.5">{exp.description}</p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => handleExport(exp)}
                disabled={loading === exp.id}
                className="btn-secondary py-2"
              >
                <Download size={14} />
                {loading === exp.id ? 'Export…' : 'Exporter'}
              </button>
              {exp.id === 'daily-sales' && (
                <button
                  onClick={handleCloseDay}
                  disabled={closingDay || !(dateFrom || dateTo)}
                  className="btn-secondary py-2 text-sm"
                  title="Clôturer la journée sélectionnée pour valider la fiche de vente"
                >
                  <Lock size={14} />
                  {closingDay ? 'Clôture…' : 'Clôturer la journée'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
