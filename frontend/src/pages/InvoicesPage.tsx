import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Edit2, FileDown, Copy, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency, formatDate, today } from '../utils/format'
import { invoiceStatusLabel, invoiceStatusColor } from '../utils/statusLabels'
import type { Invoice, PaginatedResponse, InvoiceStatus } from '../types'
import { useSiteStore } from '../store/siteStore'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const paymentSchema = z.object({
  amount: z.coerce.number().min(1, 'Montant requis'),
  date: z.string().min(1, 'Date requise'),
  method: z.string().min(1, 'Mode requis'),
  note: z.string().optional(),
})
type PaymentForm = z.infer<typeof paymentSchema>

export default function InvoicesPage() {
  const { currentSiteId } = useSiteStore()
  const [data, setData] = useState<PaginatedResponse<Invoice>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: { date: today(), method: 'virement' },
  })

  const fetchInvoices = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20', search })
    if (filterStatus) params.set('status', filterStatus)
    const res = await api.get(`/invoices?${params}`)
    setData(res.data)
  }, [page, search, filterStatus, currentSiteId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const downloadPDF = async (inv: Invoice) => {
    try {
      const res = await api.get(`/invoices/${inv.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors du téléchargement')
    }
  }

  const duplicate = async (inv: Invoice) => {
    try {
      const res = await api.post(`/invoices/${inv.id}/duplicate`)
      toast.success('Facture dupliquée')
      navigate(`/factures/${res.data.id}/modifier`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  const cancelInvoice = async (inv: Invoice) => {
    try {
      await api.patch(`/invoices/${inv.id}/status`, { status: 'annulee' })
      toast.success('Facture annulée')
      fetchInvoices()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  const onPaymentSubmit = async (formData: PaymentForm) => {
    if (!paymentModal) return
    setLoading(true)
    try {
      await api.post(`/invoices/${paymentModal.id}/payments`, formData)
      toast.success('Paiement enregistré')
      setPaymentModal(null)
      reset()
      fetchInvoices()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const statuses: InvoiceStatus[] = ['brouillon', 'emise', 'partiellement_payee', 'payee', 'annulee']
  const canEdit = (s: InvoiceStatus) => s === 'brouillon'
  const canPay = (s: InvoiceStatus) => s === 'emise' || s === 'partiellement_payee'
  const canCancel = (s: InvoiceStatus) => s === 'emise' || s === 'partiellement_payee'

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
          {statuses.map((s) => <option key={s} value={s}>{invoiceStatusLabel[s]}</option>)}
        </select>
        <button onClick={() => navigate('/factures/nouvelle')} className="btn-primary">
          <Plus size={16} />
          Nouvelle facture
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Émission</th>
              <th>Échéance</th>
              <th>Total TTC</th>
              <th>Payé</th>
              <th>Statut</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Aucune facture</td></tr>
            ) : (
              data.data.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-mono text-sm font-semibold text-primary-700">{inv.number}</td>
                  <td>
                    <p className="font-medium">{inv.client_name}</p>
                    {inv.client_company && <p className="text-xs text-gray-400">{inv.client_company}</p>}
                  </td>
                  <td className="text-gray-500 text-sm">{formatDate(inv.issue_date)}</td>
                  <td className="text-gray-500 text-sm">{formatDate(inv.due_date)}</td>
                  <td className="font-semibold">{formatCurrency(inv.total_ttc)}</td>
                  <td className="text-gray-500 text-sm">{formatCurrency(inv.amount_paid)}</td>
                  <td>
                    <span className={`badge ${invoiceStatusColor[inv.status]}`}>{invoiceStatusLabel[inv.status]}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit(inv.status) && (
                        <button onClick={() => navigate(`/factures/${inv.id}/modifier`)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Modifier">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {canPay(inv.status) && (
                        <button onClick={() => { setPaymentModal(inv); reset({ date: today(), method: 'virement' }) }} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Paiement">
                          <CreditCard size={14} />
                        </button>
                      )}
                      <button onClick={() => duplicate(inv)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Dupliquer">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => downloadPDF(inv)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="PDF">
                        <FileDown size={14} />
                      </button>
                      {canCancel(inv.status) && (
                        <button onClick={() => setCancelConfirm(inv)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Annuler">
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={setPage} />
      </div>

      <Modal isOpen={!!paymentModal} onClose={() => setPaymentModal(null)} title={`Enregistrer un paiement — ${paymentModal?.number}`} size="md">
        {paymentModal && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
            <p>Total TTC : <strong>{formatCurrency(paymentModal.total_ttc)}</strong></p>
            <p>Déjà payé : <strong>{formatCurrency(paymentModal.amount_paid)}</strong></p>
            <p>Reste dû : <strong className="text-red-600">{formatCurrency(Number(paymentModal.total_ttc) - Number(paymentModal.amount_paid))}</strong></p>
          </div>
        )}
        <form onSubmit={handleSubmit(onPaymentSubmit as any)} className="space-y-4">
          <div>
            <label className="label">Montant (FCFA) *</label>
            <input type="number" min="1" {...register('amount')} className={`input ${errors.amount ? 'input-error' : ''}`} />
            {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" {...register('date')} className={`input ${errors.date ? 'input-error' : ''}`} />
            </div>
            <div>
              <label className="label">Mode de paiement *</label>
              <select {...register('method')} className="input">
                <option value="virement">Virement</option>
                <option value="especes">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="carte">Carte</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input {...register('note')} className="input" placeholder="Optionnel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPaymentModal(null)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!cancelConfirm}
        onClose={() => setCancelConfirm(null)}
        onConfirm={() => cancelConfirm && cancelInvoice(cancelConfirm)}
        title="Annuler la facture"
        message={`Annuler la facture ${cancelConfirm?.number} ? Le stock sera re-crédité.`}
        confirmLabel="Annuler la facture"
      />
    </div>
  )
}
