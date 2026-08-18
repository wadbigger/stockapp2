import { useEffect, useState, useRef, DragEvent } from 'react'
import { Save, Plus, Upload, X, Image, DatabaseBackup } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import type { CompanySettings, Category } from '../types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { applyBranding } from '../utils/branding'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const catSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  description: z.string().optional(),
})
type CatForm = z.infer<typeof catSchema>

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    name: '',
    logo_url: '',
    address: '',
    siret: '',
    vat_number: '',
    default_vat_rate: '18',
    currency: 'FCFA',
    email: '',
    phone: '',
    website: '',
    legal_mentions: '',
    primary_color: '#2563eb',
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [catModal, setCatModal] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)
  const [loading, setLoading] = useState(false)
  const [catLoading, setCatLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CatForm>({ resolver: zodResolver(catSchema) })

  useEffect(() => {
    api.get('/settings').then((r) => setSettings(r.data)).catch(() => {})
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  const uploadLogo = async (file: File) => {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Format non supporté. Utilisez PNG, JPG, GIF, SVG ou WEBP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Fichier trop lourd (max 2 Mo)')
      return
    }
    setLogoUploading(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await api.post('/settings/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSettings((s) => ({ ...s, logo_url: res.data.logo_url }))
      toast.success('Logo mis à jour')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur lors de l\'upload')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadLogo(file)
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadLogo(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const removeLogo = async () => {
    setSettings((s) => ({ ...s, logo_url: '' }))
    try {
      await api.put('/settings', { ...settings, logo_url: '' })
      toast.success('Logo supprimé')
    } catch {
      toast.error('Erreur')
    }
  }

  const getLogoSrc = (url: string) => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    return `${API_URL}${url}`
  }

  const saveSettings = async () => {
    setLoading(true)
    try {
      const res = await api.put('/settings', settings)
      applyBranding({ name: res.data.name, logo_url: res.data.logo_url, primary_color: res.data.primary_color })
      toast.success('Paramètres sauvegardés')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const downloadBackup = async () => {
    setBackupLoading(true)
    try {
      const res = await api.post('/settings/backup', {}, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.dump`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Sauvegarde téléchargée')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la sauvegarde')
    } finally {
      setBackupLoading(false)
    }
  }

  const onCatSubmit = async (data: CatForm) => {
    setCatLoading(true)
    try {
      if (editCat) {
        const res = await api.put(`/categories/${editCat.id}`, data)
        setCategories((cats) => cats.map((c) => (c.id === editCat.id ? res.data : c)))
        toast.success('Catégorie mise à jour')
      } else {
        const res = await api.post('/categories', data)
        setCategories((cats) => [...cats, res.data])
        toast.success('Catégorie créée')
      }
      setCatModal(false)
      reset()
      setEditCat(null)
    } catch {
      toast.error('Erreur')
    } finally {
      setCatLoading(false)
    }
  }

  const deleteCategory = async (cat: Category) => {
    try {
      await api.delete(`/categories/${cat.id}`)
      setCategories((cats) => cats.filter((c) => c.id !== cat.id))
      toast.success('Catégorie supprimée')
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <h2 className="font-semibold text-gray-800 border-b border-gray-100 pb-3">Informations de l'entreprise</h2>

        {/* Logo Upload */}
        <div>
          <label className="label">Logo de l'entreprise</label>
          <div className="flex items-start gap-6">
            {/* Preview */}
            <div className="shrink-0">
              {settings.logo_url ? (
                <div className="relative group">
                  <div className="w-32 h-32 rounded-xl border-2 border-gray-200 overflow-hidden bg-white flex items-center justify-center shadow-sm">
                    <img
                      src={getLogoSrc(settings.logo_url)}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain p-2"
                      onError={(e) => { (e.target as HTMLImageElement).src = '' }}
                    />
                  </div>
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Supprimer le logo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1">
                  <Image size={28} className="text-gray-300" />
                  <span className="text-xs text-gray-400">Aucun logo</span>
                </div>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[128px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50/40'
              }`}
            >
              {logoUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Upload en cours…</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Upload size={22} className="text-primary-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">
                      Glissez votre logo ici ou{' '}
                      <span className="text-primary-600 underline underline-offset-2">parcourir</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG, WEBP — max 2 Mo</p>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
          {settings.logo_url && !settings.logo_url.startsWith('http') && (
            <p className="text-xs text-gray-400 mt-2">
              Stocké localement : <span className="font-mono">{settings.logo_url}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nom de l'entreprise</label>
            <input value={settings.name} onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Site web</label>
            <input value={settings.website} onChange={(e) => setSettings((s) => ({ ...s, website: e.target.value }))} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Adresse</label>
            <textarea value={settings.address} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} className="input" rows={2} />
          </div>
          <div>
            <label className="label">SIRET</label>
            <input value={settings.siret} onChange={(e) => setSettings((s) => ({ ...s, siret: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">N° TVA intracommunautaire</label>
            <input value={settings.vat_number} onChange={(e) => setSettings((s) => ({ ...s, vat_number: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Taux TVA par défaut (%)</label>
            <input type="number" value={settings.default_vat_rate} onChange={(e) => setSettings((s) => ({ ...s, default_vat_rate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Devise</label>
            <input value={settings.currency} className="input bg-gray-50 text-gray-500 cursor-not-allowed" readOnly />
          </div>
          <div>
            <label className="label">Couleur d'accent (branding)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.primary_color || '#2563eb'}
                onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))}
                className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
              />
              <input
                value={settings.primary_color || '#2563eb'}
                onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))}
                className="input"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Mentions légales</label>
            <textarea value={settings.legal_mentions} onChange={(e) => setSettings((s) => ({ ...s, legal_mentions: e.target.value }))} className="input" rows={3} placeholder="Mentions légales apparaissant sur les PDF…" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={saveSettings} disabled={loading} className="btn-primary">
            <Save size={16} />
            {loading ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">Sauvegarde des données</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Télécharge une copie complète de la base de données de votre entreprise (format .dump, restaurable avec pg_restore).</p>
          <button onClick={downloadBackup} disabled={backupLoading} className="btn-secondary shrink-0 ml-4">
            <DatabaseBackup size={16} />
            {backupLoading ? 'Génération…' : 'Télécharger'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Catégories de produits</h2>
          <button onClick={() => { setEditCat(null); reset(); setCatModal(true) }} className="btn-primary py-2">
            <Plus size={14} />
            Ajouter
          </button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucune catégorie</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm text-gray-800">{c.name}</p>
                  {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditCat(c); reset(c); setCatModal(true) }}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Modifier
                  </button>
                  <button onClick={() => setDeleteCat(c)} className="text-sm text-red-600 hover:underline">
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={catModal} onClose={() => setCatModal(false)} title={editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'} size="sm">
        <form onSubmit={handleSubmit(onCatSubmit)} className="space-y-4">
          <div>
            <label className="label">Nom *</label>
            <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <input {...register('description')} className="input" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCatModal(false)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={catLoading} className="btn-primary">
              {catLoading ? '…' : editCat ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteCat}
        onClose={() => setDeleteCat(null)}
        onConfirm={() => deleteCat && deleteCategory(deleteCat)}
        title="Supprimer la catégorie"
        message={`Supprimer "${deleteCat?.name}" ?`}
        confirmLabel="Supprimer"
      />
    </div>
  )
}
