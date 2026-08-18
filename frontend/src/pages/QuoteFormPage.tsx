import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import DocumentLines, { LineItem } from '../components/DocumentLines'
import { today, addDays } from '../utils/format'
import type { Client, Product, Quote, CompanySettings } from '../types'

export default function QuoteFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [lines, setLines] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    client_id: '',
    validity_date: addDays(today(), 30),
    comment: '',
  })

  useEffect(() => {
    const loadData = async () => {
      const [clientsRes, productsRes, settingsRes] = await Promise.all([
        api.get('/clients?type=client&limit=500'),
        api.get('/products?limit=500&archived=false'),
        api.get('/settings'),
      ])
      setClients(clientsRes.data.data || [])
      setProducts(productsRes.data.data || [])
      setSettings(settingsRes.data)

      if (isEdit) {
        const quoteRes = await api.get(`/quotes/${id}`)
        const q: Quote = quoteRes.data
        setForm({
          client_id: q.client_id,
          validity_date: q.validity_date?.split('T')[0] || form.validity_date,
          comment: q.comment || '',
        })
        setLines(
          (q.lines || []).map((l) => ({
            product_id: l.product_id || '',
            description: l.description,
            qty: Number(l.qty),
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            total_ht: l.total_ht,
          }))
        )
      }
    }
    loadData()
  }, [id])

  const defaultVatRate = settings?.default_vat_rate || '18'

  const subtotalHT = lines.reduce((sum, l) => {
    const qty = Number(l.qty) || 0
    const up = Number(l.unit_price) || 0
    const disc = Number(l.discount_pct) || 0
    return sum + qty * up * (1 - disc / 100)
  }, 0)

  const totalTVA = lines.reduce((sum, l) => {
    const qty = Number(l.qty) || 0
    const up = Number(l.unit_price) || 0
    const disc = Number(l.discount_pct) || 0
    const ht = qty * up * (1 - disc / 100)
    return sum + ht * ((Number(l.vat_rate) || 0) / 100)
  }, 0)

  const totalTTC = subtotalHT + totalTVA

  const onSave = async (asDraft = true) => {
    if (!form.client_id) { toast.error('Veuillez sélectionner un client'); return }
    if (lines.length === 0) { toast.error('Ajoutez au moins une ligne'); return }

    setLoading(true)
    try {
      const payload = {
        ...form,
        lines: lines.map((l) => ({
          ...l,
          total_ht: (Number(l.qty) * Number(l.unit_price) * (1 - Number(l.discount_pct) / 100)).toFixed(0),
        })),
        subtotal_ht: subtotalHT.toFixed(0),
        total_tva: totalTVA.toFixed(0),
        total_ttc: totalTTC.toFixed(0),
        status: asDraft ? 'brouillon' : 'envoye',
      }

      if (isEdit) {
        await api.put(`/quotes/${id}`, payload)
        toast.success('Devis mis à jour')
      } else {
        await api.post('/quotes', payload)
        toast.success('Devis créé')
      }
      navigate('/devis')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/devis')} className="btn-secondary py-2">
          <ArrowLeft size={16} />
          Retour
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {isEdit ? 'Modifier le devis' : 'Nouveau devis'}
        </h1>
      </div>

      <div className="card space-y-5">
        <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-3">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Client *</label>
            <select
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              className="input"
            >
              <option value="">Sélectionner un client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date de validité</label>
            <input
              type="date"
              value={form.validity_date}
              onChange={(e) => setForm((f) => ({ ...f, validity_date: e.target.value }))}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Commentaire / Notes</label>
          <textarea
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
            className="input"
            rows={2}
            placeholder="Conditions de paiement, remarques…"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-4">Lignes du devis</h2>
        <DocumentLines
          lines={lines}
          products={products}
          defaultVatRate={defaultVatRate}
          onChange={setLines}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/devis')} className="btn-secondary">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onSave(true)}
          disabled={loading}
          className="btn-secondary"
        >
          <Save size={16} />
          {loading ? 'Enregistrement…' : 'Sauvegarder brouillon'}
        </button>
        <button
          type="button"
          onClick={() => onSave(false)}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Enregistrement…' : 'Créer & envoyer'}
        </button>
      </div>
    </div>
  )
}
