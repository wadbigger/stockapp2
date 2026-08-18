import { useState } from 'react'
import { Plus, Save } from 'lucide-react'
import Modal from '../../components/Modal'
import platformApi from '../../services/platformApi'
import { toast } from '../../components/Toast'
import type { PlatformPlan } from '../../types/platform'

interface Props {
  isOpen: boolean
  onClose: () => void
  plans: PlatformPlan[]
  onChanged: () => void
}

export default function PlansModal({ isOpen, onClose, plans, onChanged }: Props) {
  const [form, setForm] = useState({ name: '', price_monthly: '0', currency: 'FCFA' })
  const [creating, setCreating] = useState(false)

  const createPlan = async () => {
    if (!form.name.trim()) {
      toast.error('Nom du plan requis')
      return
    }
    setCreating(true)
    try {
      await platformApi.post('/plans', { ...form, price_monthly: parseFloat(form.price_monthly) || 0 })
      toast.success('Plan créé')
      setForm({ name: '', price_monthly: '0', currency: 'FCFA' })
      onChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Échec de la création')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (plan: PlatformPlan) => {
    try {
      await platformApi.patch(`/plans/${plan.id}`, { active: !plan.active })
      onChanged()
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestion des plans" size="lg">
      <div className="space-y-4">
        <div className="space-y-2">
          {plans.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun plan défini</p>
          ) : (
            plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                <div>
                  <p className="font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{Math.round(parseFloat(p.price_monthly))} {p.currency} / mois</p>
                </div>
                <button
                  onClick={() => toggleActive(p)}
                  className={`badge ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                >
                  {p.active ? 'Actif' : 'Inactif'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="label mb-2">Nouveau plan</p>
          <div className="grid grid-cols-3 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input"
              placeholder="Nom (ex: Business)"
            />
            <input
              type="number"
              value={form.price_monthly}
              onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))}
              className="input"
              placeholder="Prix / mois"
            />
            <input
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="input"
              placeholder="Devise"
            />
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={createPlan} disabled={creating} className="btn-primary py-2">
              <Plus size={14} />
              {creating ? 'Création…' : 'Ajouter le plan'}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">
            <Save size={14} />
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  )
}
