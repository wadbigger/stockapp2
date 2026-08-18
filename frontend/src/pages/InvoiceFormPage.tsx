import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Send } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import DocumentLines, { LineItem } from '../components/DocumentLines'
import { today, addDays } from '../utils/format'
import type { Client, Product, Invoice, CompanySettings } from '../types'

export default function InvoiceFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [lines, setLines] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [issueWarning, setIssueWarning] = useState<string | null>(null)

  const [form, setForm] = useState({
    client_id: '',
    issue_date: today(),
    due_date: addDays(today(), 30),
    payment_method: 'virement',
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
        const invRes = await api.get(`/invoices/${id}`)
        const inv: Invoice = invRes.data
        setForm({
          client_id: inv.client_id,
          issue_date: inv.issue_date?.split('T')[0] || today(),
          due_date: inv.due_date?.split('T')[0] || addDays(today(), 30),
          payment_method: inv.payment_method || 'virement',
          comment: '',
        })
        setLines(
          (inv.lines || []).map((l) => ({
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

  const onSave = async (emit = false) => {
    if (!form.client_id) { toast.error('Veuillez sélectionner un client'); return }
    if (lines.length === 0) { toast.error('Ajoutez au moins une ligne'); return }

    if (emit) {
      const stockRes = await api.post('/invoices/check-stock', { lines })
      if (stockRes.data.warnings?.length > 0) {
        setIssueWarning(stockRes.data.warnings.join('\n'))
        return
      }
    }

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
        status: emit ? 'emise' : 'brouillon',
      }

      if (isEdit) {
        await api.put(`/invoices/${id}`, payload)
        toast.success(emit ? 'Facture émise !' : 'Facture mise à jour')
      } else {
        await api.post('/invoices', payload)
        toast.success(emit ? 'Facture émise !' : 'Facture créée')
      }
      navigate('/factures')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/factures')} className="btn-secondary py-2">
          <ArrowLeft size={16} />
          Retour
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {isEdit ? 'Modifier la facture' : 'Nouvelle facture'}
        </h1>
      </div>

      {issueWarning && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Stock insuffisant :</p>
          <pre className="text-xs text-red-700 whitespace-pre-wrap">{issueWarning}</pre>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setIssueWarning(null)} className="btn-secondary text-sm py-1">Corriger les lignes</button>
            <button onClick={async () => { setIssueWarning(null); await onSave(true) }} className="btn-danger text-sm py-1">Émettre quand même</button>
          </div>
        </div>
      )}

      <div className="card space-y-5">
        <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-3">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="md:col-span-2">
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
            <label className="label">Date d'émission</label>
            <input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Date d'échéance</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Mode de paiement</label>
          <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className="input w-auto">
            <option value="virement">Virement bancaire</option>
            <option value="especes">Espèces</option>
            <option value="cheque">Chèque</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="carte">Carte bancaire</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-700 border-b border-gray-100 pb-3 mb-4">Lignes de la facture</h2>
        <DocumentLines
          lines={lines}
          products={products}
          defaultVatRate={defaultVatRate}
          onChange={setLines}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/factures')} className="btn-secondary">Annuler</button>
        <button type="button" onClick={() => onSave(false)} disabled={loading} className="btn-secondary">
          <Save size={16} />
          {loading ? 'Enregistrement…' : 'Sauvegarder brouillon'}
        </button>
        <button type="button" onClick={() => onSave(true)} disabled={loading} className="btn-primary">
          <Send size={16} />
          {loading ? 'Émission…' : 'Émettre la facture'}
        </button>
      </div>
    </div>
  )
}
