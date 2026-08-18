import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Edit2, Archive, ArchiveRestore, Filter } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatCurrency } from '../utils/format'
import type { Product, Category, PaginatedResponse } from '../types'
import { useSiteStore } from '../store/siteStore'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  sku: z.string().min(1, 'SKU requis'),
  name: z.string().min(1, 'Nom requis'),
  category_ids: z.array(z.string()).optional(),
  purchase_price: z.string().min(1, 'Prix achat requis'),
  sale_price: z.string().min(1, 'Prix vente requis'),
  unit: z.string().min(1, 'Unité requise'),
  description: z.string().optional(),
  alert_threshold: z.coerce.number().min(0),
  initial_stock: z.coerce.number().min(0).optional(),
})

type FormData = z.infer<typeof schema>

export default function ProductsPage() {
  const { currentSiteId } = useSiteStore()
  const [data, setData] = useState<PaginatedResponse<Product>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showArchived, setShowArchived] = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) as any, defaultValues: { alert_threshold: 0, initial_stock: 0 } })

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '20',
      search,
      archived: showArchived.toString(),
      sort: sortBy,
      order: sortOrder,
    })
    if (filterCat) params.set('category', filterCat)
    const res = await api.get(`/products?${params}`)
    setData(res.data)
  }, [page, search, showArchived, filterCat, sortBy, sortOrder, currentSiteId])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data))
  }, [currentSiteId])

  const openCreate = () => {
    setEditProduct(null)
    reset({ alert_threshold: 0, initial_stock: 0 })
    setModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    reset({
      sku: p.sku,
      name: p.name,
      category_ids: p.categories?.map((c) => c.id) || [],
      purchase_price: p.purchase_price,
      sale_price: p.sale_price,
      unit: p.unit,
      description: p.description,
      alert_threshold: p.alert_threshold,
    })
    setModalOpen(true)
  }

  const onSubmit = async (formData: FormData) => {
    setLoading(true)
    try {
      if (editProduct) {
        await api.put(`/products/${editProduct.id}`, formData)
        toast.success('Produit mis à jour')
      } else {
        await api.post('/products', formData)
        toast.success('Produit créé')
      }
      setModalOpen(false)
      fetchProducts()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const toggleArchive = async (p: Product) => {
    try {
      await api.patch(`/products/${p.id}/archive`, { archived: !p.archived })
      toast.success(p.archived ? 'Produit restauré' : 'Produit archivé')
      fetchProducts()
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, SKU…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); setPage(1) }}
          className="input w-auto"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input w-auto">
          <option value="name">Nom</option>
          <option value="current_stock">Stock</option>
          <option value="created_at">Date création</option>
          <option value="sale_price">Prix vente</option>
        </select>
        <button
          onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          className="btn-secondary py-2"
        >
          {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`btn-secondary py-2 ${showArchived ? 'bg-orange-50 border-orange-200 text-orange-700' : ''}`}
        >
          <Filter size={14} />
          {showArchived ? 'Masquer archivés' : 'Afficher archivés'}
        </button>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} />
          Nouveau produit
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nom</th>
              <th>Catégorie</th>
              <th>Stock</th>
              <th>Prix achat</th>
              <th>Prix vente</th>
              <th>Unité</th>
              <th>Statut</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.data.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucun produit</td></tr>
            ) : (
              data.data.map((p) => (
                <tr key={p.id} className={p.archived ? 'opacity-60' : ''}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-gray-500 text-xs">
                    {p.categories?.map((c) => c.name).join(', ') || '-'}
                  </td>
                  <td>
                    <span className={`font-semibold ${p.current_stock <= p.alert_threshold ? 'text-red-600' : 'text-gray-900'}`}>
                      {p.current_stock}
                    </span>
                    {p.current_stock <= p.alert_threshold && (
                      <span className="ml-1 badge bg-red-100 text-red-600">Alerte</span>
                    )}
                  </td>
                  <td className="text-gray-600">{formatCurrency(p.purchase_price)}</td>
                  <td className="font-medium">{formatCurrency(p.sale_price)}</td>
                  <td className="text-gray-500">{p.unit}</td>
                  <td>
                    {p.archived ? (
                      <span className="badge bg-orange-100 text-orange-700">Archivé</span>
                    ) : (
                      <span className="badge bg-green-100 text-green-700">Actif</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmArchive(p)}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                        title={p.archived ? 'Restaurer' : 'Archiver'}
                      >
                        {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          limit={data.limit}
          onPageChange={setPage}
        />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editProduct ? 'Modifier le produit' : 'Nouveau produit'}
        size="lg"
      >
          <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SKU *</label>
              <input {...register('sku')} className={`input ${errors.sku ? 'input-error' : ''}`} placeholder="PROD-001" />
              {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p>}
            </div>
            <div>
              <label className="label">Nom *</label>
              <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="Nom du produit" />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Prix d'achat (FCFA) *</label>
              <input type="number" {...register('purchase_price')} className={`input ${errors.purchase_price ? 'input-error' : ''}`} placeholder="0" />
              {errors.purchase_price && <p className="mt-1 text-xs text-red-600">{errors.purchase_price.message}</p>}
            </div>
            <div>
              <label className="label">Prix de vente (FCFA) *</label>
              <input type="number" {...register('sale_price')} className={`input ${errors.sale_price ? 'input-error' : ''}`} placeholder="0" />
              {errors.sale_price && <p className="mt-1 text-xs text-red-600">{errors.sale_price.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unité *</label>
              <select {...register('unit')} className={`input ${errors.unit ? 'input-error' : ''}`}>
                <option value="">Sélectionner</option>
                <option value="pièce">Pièce</option>
                <option value="kg">Kg</option>
                <option value="litre">Litre</option>
                <option value="mètre">Mètre</option>
                <option value="carton">Carton</option>
                <option value="sac">Sac</option>
                <option value="unité">Unité</option>
              </select>
              {errors.unit && <p className="mt-1 text-xs text-red-600">{errors.unit.message}</p>}
            </div>
            <div>
              <label className="label">Seuil d'alerte</label>
              <input type="number" {...register('alert_threshold')} className="input" placeholder="5" />
            </div>
          </div>

          <div>
            <label className="label">Catégories</label>
            <div className="flex flex-wrap gap-2 border border-gray-300 rounded-lg p-3 min-h-[60px]">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    value={c.id}
                    {...register('category_ids')}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">{c.name}</span>
                </label>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-gray-400">Aucune catégorie. Créez-en dans Paramètres.</p>
              )}
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea {...register('description')} className="input" rows={2} placeholder="Description optionnelle…" />
          </div>

          {!editProduct && (
            <div>
              <label className="label">Stock initial</label>
              <input type="number" {...register('initial_stock')} className="input" placeholder="0" />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Enregistrement…' : editProduct ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => confirmArchive && toggleArchive(confirmArchive)}
        title={confirmArchive?.archived ? 'Restaurer le produit' : 'Archiver le produit'}
        message={
          confirmArchive?.archived
            ? `Restaurer "${confirmArchive.name}" ?`
            : `Archiver "${confirmArchive?.name}" ? Le produit ne sera plus visible dans les formulaires.`
        }
        confirmLabel={confirmArchive?.archived ? 'Restaurer' : 'Archiver'}
        variant={confirmArchive?.archived ? 'primary' : 'danger'}
      />
    </div>
  )
}
