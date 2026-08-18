import { useEffect, useState } from 'react'
import { Plus, Save, MapPin, Users, Trash2 } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import type { Site, User } from '../types'

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [deleteSite, setDeleteSite] = useState<Site | null>(null)
  const [usersModal, setUsersModal] = useState<Site | null>(null)
  const [siteUserIds, setSiteUserIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '' })

  useEffect(() => {
    api.get('/sites').then((r) => setSites(r.data || []))
    api.get('/users').then((r) => setAllUsers(r.data || []))
  }, [])

  const openCreate = () => {
    setEditSite(null)
    setForm({ name: '', address: '', phone: '', email: '' })
    setShowModal(true)
  }

  const openEdit = (site: Site) => {
    setEditSite(site)
    setForm({ name: site.name, address: site.address, phone: site.phone, email: site.email })
    setShowModal(true)
  }

  const saveSite = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return }
    setLoading(true)
    try {
      if (editSite) {
        const res = await api.put(`/sites/${editSite.id}`, form)
        setSites((prev) => prev.map((s) => (s.id === editSite.id ? res.data : s)))
        toast.success('Magasin mis à jour')
      } else {
        const res = await api.post('/sites', form)
        setSites((prev) => [...prev, res.data])
        toast.success('Magasin créé')
      }
      setShowModal(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const removeSite = async (site: Site) => {
    try {
      await api.delete(`/sites/${site.id}`)
      setSites((prev) => prev.filter((s) => s.id !== site.id))
      toast.success('Magasin supprimé')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    }
  }

  const openUsers = async (site: Site) => {
    setUsersModal(site)
    try {
      const res = await api.get(`/sites/${site.id}/users`)
      setSiteUserIds(res.data.map((u: User) => u.id))
    } catch {
      setSiteUserIds([])
    }
  }

  const toggleUser = (uid: string) => {
    setSiteUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    )
  }

  const saveUsers = async () => {
    if (!usersModal) return
    setLoading(true)
    try {
      await api.post(`/sites/${usersModal.id}/users`, { user_ids: siteUserIds })
      toast.success('Utilisateurs mis à jour')
      setUsersModal(null)
    } catch {
      toast.error('Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestion des magasins</h1>
          <p className="text-sm text-gray-500">Gérez vos différents magasins et affectez les utilisateurs</p>
        </div>
        <button onClick={openCreate} className="btn-primary py-2.5">
          <Plus size={16} />
          Nouveau magasin
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((site) => (
          <div key={site.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                  <MapPin size={20} className="text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{site.name}</h3>
                  {!site.active && <span className="text-xs text-red-500 font-medium">Inactif</span>}
                </div>
              </div>
              {sites.length > 1 && (
                <button
                  onClick={() => setDeleteSite(site)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="space-y-1 text-sm text-gray-500 mb-4">
              {site.address && <p>{site.address}</p>}
              {site.phone && <p>Tel : {site.phone}</p>}
              {site.email && <p>Email : {site.email}</p>}
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => openEdit(site)}
                className="flex-1 text-sm text-primary-600 hover:bg-primary-50 py-1.5 rounded-lg transition-colors font-medium"
              >
                Modifier
              </button>
              <button
                onClick={() => openUsers(site)}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-600 hover:bg-gray-50 py-1.5 rounded-lg transition-colors font-medium"
              >
                <Users size={14} />
                Utilisateurs
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editSite ? 'Modifier le magasin' : 'Nouveau magasin'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom du magasin *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="Ex: Magasin Cotonou" />
          </div>
          <div>
            <label className="label">Adresse</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
            <button onClick={saveSite} disabled={loading} className="btn-primary">
              <Save size={16} />
              {loading ? '…' : editSite ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Users assignment modal */}
      <Modal isOpen={!!usersModal} onClose={() => setUsersModal(null)} title={`Utilisateurs — ${usersModal?.name}`} size="md">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {allUsers.map((u) => (
            <label
              key={u.id}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                siteUserIds.includes(u.id) ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
              }`}
            >
              <input
                type="checkbox"
                checked={siteUserIds.includes(u.id)}
                onChange={() => toggleUser(u.id)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{u.name}</p>
                <p className="text-xs text-gray-500">{u.email} — {u.role}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
          <button onClick={() => setUsersModal(null)} className="btn-secondary">Annuler</button>
          <button onClick={saveUsers} disabled={loading} className="btn-primary">
            <Save size={16} />
            {loading ? '…' : 'Enregistrer'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteSite}
        onClose={() => setDeleteSite(null)}
        onConfirm={() => deleteSite && removeSite(deleteSite)}
        title="Supprimer le magasin"
        message={`Supprimer "${deleteSite?.name}" ? Les données associées ne seront plus accessibles.`}
        confirmLabel="Supprimer"
      />
    </div>
  )
}
