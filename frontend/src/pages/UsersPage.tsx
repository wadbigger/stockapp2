import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit2, UserX, UserCheck } from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatDate } from '../utils/format'
import type { User, UserRole } from '../types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/authStore'

const loginRegex = /^[a-zA-Z0-9_.-]{3,50}$/

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  login: z.string().regex(loginRegex, '3-50 caractères : lettres, chiffres, points, tirets ou underscores'),
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Min 6 caractères'),
  role: z.enum(['superadmin', 'admin', 'vendeur', 'gestionnaire', 'comptable']),
})

const editSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  login: z.string().regex(loginRegex, '3-50 caractères : lettres, chiffres, points, tirets ou underscores'),
  email: z.string().email('Email invalide'),
  password: z.string().optional(),
  role: z.enum(['superadmin', 'admin', 'vendeur', 'gestionnaire', 'comptable']),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

const roleLabels: Record<UserRole, string> = {
  superadmin: 'Super Administrateur',
  admin: 'Administrateur',
  vendeur: 'Vendeur',
  gestionnaire: 'Gestionnaire de stock',
  comptable: 'Comptable',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [toggleConfirm, setToggleConfirm] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const { user: currentUser } = useAuthStore()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm | EditForm>({
    resolver: zodResolver(editUser ? editSchema : createSchema),
    defaultValues: { role: 'vendeur' },
  })

  const fetchUsers = useCallback(async () => {
    const res = await api.get('/users')
    setUsers(res.data)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openCreate = () => {
    setEditUser(null)
    reset({ role: 'vendeur', name: '', login: '', email: '', password: '' })
    setModalOpen(true)
  }

  const openEdit = (u: User) => {
    setEditUser(u)
    reset({ name: u.name, login: u.login, email: u.email, role: u.role, password: '' })
    setModalOpen(true)
  }

  const onSubmit = async (formData: CreateForm | EditForm) => {
    setLoading(true)
    try {
      const data = { ...formData }
      if (editUser && !(data as EditForm).password) {
        delete (data as any).password
      }
      if (editUser) {
        await api.put(`/users/${editUser.id}`, data)
        toast.success('Utilisateur mis à jour')
      } else {
        await api.post('/users', data)
        toast.success('Utilisateur créé')
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}/active`, { active: !u.active })
      toast.success(u.active ? 'Utilisateur désactivé' : 'Utilisateur activé')
      fetchUsers()
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} />
          Nouvel utilisateur
        </button>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Login</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={!u.active ? 'opacity-60' : ''}>
                <td className="font-medium">{u.name}</td>
                <td className="text-gray-600">{u.login}</td>
                <td className="text-gray-600">{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : 'bg-primary-100 text-primary-700'}`}>
                    {roleLabels[u.role]}
                  </span>
                </td>
                <td>
                  {u.active ? (
                    <span className="badge bg-green-100 text-green-700">Actif</span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-600">Désactivé</span>
                  )}
                </td>
                <td className="text-gray-500 text-sm">{formatDate(u.created_at)}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(u.role !== 'superadmin' || currentUser?.role === 'superadmin') && (
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg">
                        <Edit2 size={14} />
                      </button>
                    )}
                    {u.id !== currentUser?.id && (u.role !== 'superadmin' || currentUser?.role === 'superadmin') && (
                      <button onClick={() => setToggleConfirm(u)} className={`p-1.5 text-gray-400 rounded-lg ${u.active ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-green-600 hover:bg-green-50'}`}>
                        {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'} size="md">
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
          <div>
            <label className="label">Nom *</label>
            <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Login *</label>
            <input {...register('login')} autoCapitalize="none" autoCorrect="off" className={`input ${errors.login ? 'input-error' : ''}`} />
            {errors.login && <p className="mt-1 text-xs text-red-600">{(errors.login as any)?.message}</p>}
            <p className="mt-1 text-xs text-gray-400">Utilisé pour se connecter à StockApp.</p>
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" {...register('email')} className={`input ${errors.email ? 'input-error' : ''}`} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">{editUser ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}</label>
            <input type="password" {...register('password')} className={`input ${errors.password ? 'input-error' : ''}`} />
            {errors.password && <p className="mt-1 text-xs text-red-600">{(errors.password as any)?.message}</p>}
          </div>
          <div>
            <label className="label">Rôle *</label>
            <select {...register('role')} className="input">
              {(Object.entries(roleLabels) as [UserRole, string][])
                .filter(([value]) => value !== 'superadmin' || currentUser?.role === 'superadmin')
                .map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? '…' : editUser ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!toggleConfirm}
        onClose={() => setToggleConfirm(null)}
        onConfirm={() => toggleConfirm && toggleActive(toggleConfirm)}
        title={toggleConfirm?.active ? 'Désactiver l\'utilisateur' : 'Activer l\'utilisateur'}
        message={`${toggleConfirm?.active ? 'Désactiver' : 'Activer'} l'utilisateur "${toggleConfirm?.name}" ?`}
        confirmLabel={toggleConfirm?.active ? 'Désactiver' : 'Activer'}
        variant={toggleConfirm?.active ? 'danger' : 'primary'}
      />
    </div>
  )
}
