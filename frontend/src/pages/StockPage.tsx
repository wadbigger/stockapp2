import { useEffect, useState, useCallback } from 'react'
import { Plus, Search } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { formatDate } from '../utils/format'
import { movementTypeLabel, movementTypeColor } from '../utils/statusLabels'
import type { StockMovement, Product, PaginatedResponse, StockMovementType } from '../types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { today } from '../utils/format'
import { useSiteStore } from '../store/siteStore'

const schema = z.object({
  product_id: z.string().min(1, 'Produit requis'),
  type: z.enum(['entree', 'sortie', 'ajustement']),
  quantity: z.coerce.number().min(1, 'Quantité min 1'),
  reason: z.string().min(1, 'Motif requis'),
  date: z.string().min(1, 'Date requise'),
  supplier_ref: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function StockPage() {
  const { currentSiteId } = useSiteStore()
  const [data, setData] = useState<PaginatedResponse<StockMovement>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { type: 'entree', date: today() },
  })

  const fetchMovements = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: '20' })
    if (search) params.set('search', search)
    if (filterType) params.set('type', filterType)
    if (filterProduct) params.set('product_id', filterProduct)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const res = await api.get(`/stock?${params}`)
    setData(res.data)
  }, [page, search, filterType, filterProduct, dateFrom, dateTo, currentSiteId])

  useEffect(() => { fetchMovements() }, [fetchMovements])
  useEffect(() => {
    api.get('/products?limit=500&archived=false').then((r) => setProducts(r.data.data || []))
  }, [currentSiteId])

  const onSubmit = async (formData: FormData) => {
    setLoading(true)
    try {
      await api.post('/stock', formData)
      toast.success('Mouvement enregistré')
      setModalOpen(false)
      reset({ type: 'entree', date: today() })
      fetchMovements()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const typeOptions: { value: StockMovementType; label: string }[] = [
    { value: 'entree', label: 'Entrée' },
    { value: 'sortie', label: 'Sortie' },
    { value: 'ajustement', label: 'Ajustement' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9"
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input w-auto">
          <option value="">Tous les types</option>
          {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="vente">Vente</option>
        </select>
        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} className="input w-auto">
          <option value="">Tous les produits</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-auto" title="Date début" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-auto" title="Date fin" />
        <button onClick={() => { setModalOpen(true); reset({ type: 'entree', date: today() }) }} className="btn-primary">
          <Plus size={16} />
          Mouvement
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Produit</th>
              <th>Type</th>
              <th>Quantité</th>
              <th>Motif</th>
              <th>Réf. fournisseur</th>
              <th>Facture</th>
              <th>Par</th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Aucun mouvement</td></tr>
            ) : (
              data.data.map((m) => (
                <tr key={m.id}>
                  <td className="text-gray-500 text-xs">{formatDate(m.date)}</td>
                  <td>
                    <p className="font-medium">{m.product_name}</p>
                    <p className="text-xs text-gray-400">{m.product_sku}</p>
                  </td>
                  <td>
                    <span className={`badge ${movementTypeColor[m.type]}`}>
                      {movementTypeLabel[m.type]}
                    </span>
                  </td>
                  <td>
                    <span className={`font-semibold ${m.type === 'entree' ? 'text-green-600' : m.type === 'sortie' || m.type === 'vente' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {m.type === 'entree' ? '+' : m.type === 'ajustement' ? '±' : '-'}{m.quantity}
                    </span>
                  </td>
                  <td className="text-gray-600 text-sm">{m.reason}</td>
                  <td className="text-gray-500 text-xs">{m.supplier_ref || '-'}</td>
                  <td className="text-xs">{m.invoice_number ? <span className="text-primary-600">{m.invoice_number}</span> : '-'}</td>
                  <td className="text-gray-500 text-xs">{m.created_by_name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={setPage} />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau mouvement de stock" size="md">
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          <div>
            <label className="label">Produit *</label>
            <select {...register('product_id')} className={`input ${errors.product_id ? 'input-error' : ''}`}>
              <option value="">Sélectionner un produit</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku}) — Stock: {p.current_stock} {p.unit}</option>
              ))}
            </select>
            {errors.product_id && <p className="mt-1 text-xs text-red-600">{errors.product_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type *</label>
              <select {...register('type')} className="input">
                {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quantité *</label>
              <input type="number" min="1" {...register('quantity')} className={`input ${errors.quantity ? 'input-error' : ''}`} />
              {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Date *</label>
            <input type="date" {...register('date')} className={`input ${errors.date ? 'input-error' : ''}`} />
          </div>

          <div>
            <label className="label">Motif *</label>
            <input {...register('reason')} className={`input ${errors.reason ? 'input-error' : ''}`} placeholder="Ex: Réapprovisionnement, Casse…" />
            {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
          </div>

          <div>
            <label className="label">Référence fournisseur</label>
            <input {...register('supplier_ref')} className="input" placeholder="Optionnel" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
