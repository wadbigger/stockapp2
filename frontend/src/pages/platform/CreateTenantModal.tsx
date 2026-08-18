import { useState } from 'react'
import { Save } from 'lucide-react'
import Modal from '../../components/Modal'
import platformApi from '../../services/platformApi'
import { toast } from '../../components/Toast'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export default function CreateTenantModal({ isOpen, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    slug: '',
    name: '',
    adminEmail: '',
    adminLogin: '',
    adminPassword: '',
    primaryColor: '#2563eb',
  })
  const [loading, setLoading] = useState(false)

  const reset = () => setForm({ slug: '', name: '', adminEmail: '', adminLogin: '', adminPassword: '', primaryColor: '#2563eb' })

  const submit = async () => {
    if (!form.slug.trim() || !form.name.trim() || !form.adminEmail.trim() || !form.adminLogin.trim() || !form.adminPassword.trim()) {
      toast.error('Tous les champs sont requis')
      return
    }
    setLoading(true)
    try {
      await platformApi.post('/tenants', form)
      toast.success('Tenant créé avec succès')
      reset()
      onCreated()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la création')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouveau tenant" size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Nom de l'entreprise *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input"
            placeholder="Ex: Acme SARL"
          />
        </div>
        <div>
          <label className="label">Slug (identifiant unique) *</label>
          <input
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
            className="input"
            placeholder="ex: acme"
          />
          <p className="text-xs text-gray-400 mt-1">Lettres minuscules, chiffres, tirets uniquement</p>
        </div>
        <div>
          <label className="label">Login administrateur *</label>
          <input
            value={form.adminLogin}
            onChange={(e) => setForm((f) => ({ ...f, adminLogin: e.target.value }))}
            className="input"
            placeholder="ex: admin.acme"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <p className="text-xs text-gray-400 mt-1">Utilisé pour se connecter (3-50 caractères : lettres, chiffres, points, tirets ou underscores)</p>
        </div>
        <div>
          <label className="label">Email administrateur *</label>
          <input
            type="email"
            value={form.adminEmail}
            onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
            className="input"
            placeholder="admin@acme.com"
          />
        </div>
        <div>
          <label className="label">Mot de passe administrateur *</label>
          <input
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="label">Couleur principale (white label)</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              className="w-12 h-9 rounded-lg border border-gray-300 cursor-pointer"
            />
            <span className="text-sm text-gray-500">{form.primaryColor}</span>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            <Save size={16} />
            {loading ? 'Création…' : 'Créer le tenant'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
