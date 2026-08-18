import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Edit2, Trash2, FileText } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatDate, formatCurrency } from '../utils/format'
import { invoiceStatusLabel, invoiceStatusColor } from '../utils/statusLabels'
import type { Client, PaginatedResponse, Invoice } from '../types'
import { useSiteStore } from '../store/siteStore'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  type: z.enum(['client', 'fournisseur']),
  name: z.string().min(1, 'Nom requis'),
  company: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  tax_number: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function ClientsPage() {
  const { currentSiteId } = useSiteStore()
  const [data, setData] = useState<PaginatedResponse<Client>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'client' },
  })

  const fetchClients = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20', search })
    if (filterType) params.set('type', filterType)
    const res = await api.get(`/clients?${params}`)
    setData(res.data)
  }, [page, search, filterType, currentSiteId])

  useEffect(() => { fetchClients() }, [fetchClients])

  const openCreate = () => {
    setEditClient(null)
    reset({ type: 'client' })
    setModalOpen(true)
  }

  const openEdit = (c: Client) => {
    setEditClient(c)
    reset(c)
    setModalOpen(true)
  }

  const openHistory = async (c: Client) => {
    setHistoryClient(c)
    const res = await api.get(`/clients/${c.id}/invoices`)
    setClientInvoices(res.data)
  }

  const onSubmit = async (formData: FormData) => {
    setLoading(true)
    try {
      if (editClient) {
        await api.put(`/clients/${editClient.id}`, formData)
        toast.success('Client mis à jour')
      } else {
        await api.post('/clients', formData)
        toast.success('Client créé')
      }
      setModalOpen(false)
      fetchClients()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const deleteClient = async (c: Client) => {
    try {
      await api.delete(`/clients/${c.id}`)
      toast.success('Client supprimé')
      fetchClients()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher nom, entreprise, email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9"
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input w-auto">
          <option value="">Tous</option>
          <option value="client">Clients</option>
          <option value="fournisseur">Fournisseurs</option>
        </select>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} />
          Nouveau
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Nom</th>
              <th>Entreprise</th>
              <th>Email</th>
              <th>Téléphone</th>
              <th>Créé le</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun client / fournisseur</td></tr>
            ) : (
              data.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`badge ${c.type === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {c.type === 'client' ? 'Client' : 'Fournisseur'}
                    </span>
                  </td>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-gray-500">{c.company || '-'}</td>
                  <td className="text-gray-500 text-sm">{c.email || '-'}</td>
                  <td className="text-gray-500 text-sm">{c.phone || '-'}</td>
                  <td className="text-gray-500 text-xs">{formatDate(c.created_at)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.type === 'client' && (
                        <button onClick={() => openHistory(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Historique factures">
                          <FileText size={14} />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(c)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editClient ? 'Modifier' : 'Nouveau client / fournisseur'} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Type *</label>
            <div className="flex gap-4">
              {['client', 'fournisseur'].map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value={t} {...register('type')} className="text-primary-600" />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nom *</label>
              <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Entreprise</label>
              <input {...register('company')} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" {...register('email')} className={`input ${errors.email ? 'input-error' : ''}`} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input {...register('phone')} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Adresse</label>
            <textarea {...register('address')} className="input" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">N° fiscal</label>
              <input {...register('tax_number')} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Enregistrement…' : editClient ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!historyClient} onClose={() => setHistoryClient(null)} title={`Factures de ${historyClient?.name}`} size="xl">
        {clientInvoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aucune facture</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Total TTC</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {clientInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-mono text-sm">{inv.number}</td>
                  <td className="text-gray-500">{formatDate(inv.issue_date)}</td>
                  <td className="font-semibold">{formatCurrency(inv.total_ttc)}</td>
                  <td><span className={`badge ${invoiceStatusColor[inv.status]}`}>{invoiceStatusLabel[inv.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteClient(confirmDelete)}
        title="Supprimer"
        message={`Supprimer "${confirmDelete?.name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
      />
    </div>
  )
}
