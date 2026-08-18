import { useState, useRef, useEffect } from 'react'
import { LogOut, Bell, User, ChevronDown, Shield, Mail, Camera } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAlertStore } from '../store/alertStore'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import { toast } from './Toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const pageTitles: Record<string, string> = {
  '/': 'Tableau de bord',
  '/produits': 'Produits',
  '/stock': 'Mouvements de stock',
  '/alertes': 'Alertes de stock',
  '/clients': 'Clients & Fournisseurs',
  '/ventes': 'Ventes',
  '/ventes/nouvelle': 'Nouvelle vente',
  '/devis': 'Devis',
  '/devis/nouveau': 'Nouveau devis',
  '/factures': 'Factures',
  '/factures/nouvelle': 'Nouvelle facture',
  '/synthese': 'Tableau de synthèse par magasin',
  '/rapports': 'Rapports & Exports',
  '/parametres': 'Paramètres',
  '/sites': 'Gestion des magasins',
  '/utilisateurs': 'Gestion des utilisateurs',
}

const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrateur',
  vendeur: 'Vendeur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
}

export default function TopBar() {
  const { user, clearAuth, setAuth } = useAuthStore()
  const { alertCount } = useAlertStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const title =
    Object.entries(pageTitles).find(([path]) => pathname === path)?.[1] ||
    (pathname.includes('/modifier') ? 'Modifier' : 'Page')

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') })
    } catch {}
    clearAuth()
    navigate('/login')
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user?.name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const avatarSrc = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_URL}${user.avatar_url}`)
    : ''

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error('Format non supporté. Utilisez PNG, JPG, GIF ou WEBP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Fichier trop lourd (max 2 Mo)')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await api.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (user) {
        const updated = { ...user, avatar_url: res.data.avatar_url }
        const token = localStorage.getItem('accessToken') || ''
        const refresh = localStorage.getItem('refreshToken') || ''
        setAuth(updated, token, refresh)
      }
      toast.success('Photo de profil mise à jour')
    } catch {
      toast.error('Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAvatarRemove = async () => {
    try {
      await api.delete('/auth/avatar')
      if (user) {
        const updated = { ...user, avatar_url: '' }
        const token = localStorage.getItem('accessToken') || ''
        const refresh = localStorage.getItem('refreshToken') || ''
        setAuth(updated, token, refresh)
      }
      toast.success('Photo de profil supprimée')
    } catch {
      toast.error('Erreur')
    }
  }

  const AvatarDisplay = ({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-16 h-16 text-xl',
    }
    return avatarSrc ? (
      <img
        src={avatarSrc}
        alt="Avatar"
        className={`${sizeClasses[size]} rounded-full object-cover shadow-sm border-2 border-white`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <div className={`${sizeClasses[size]} bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-bold shadow-sm`}>
        {initials}
      </div>
    )
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
      <h2 className="font-semibold text-gray-800">{title}</h2>

      <div className="flex items-center gap-2">
        {/* Alerts */}
        <button
          onClick={() => navigate('/alertes')}
          className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Alertes stock"
        >
          <Bell size={20} />
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        <div className="w-px h-8 bg-gray-200 mx-1" />

        {/* Profile dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <AvatarDisplay size="sm" />
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-tight">{user?.name}</p>
              <p className="text-xs text-gray-500 leading-tight">{roleLabels[user?.role || ''] || user?.role}</p>
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
              {/* Profile header with avatar upload */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="relative group shrink-0">
                    <AvatarDisplay size="lg" />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Changer la photo"
                    >
                      {uploading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera size={20} className="text-white" />
                      )}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Changer la photo
                      </button>
                      {avatarSrc && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={handleAvatarRemove}
                            className="text-xs text-red-500 hover:text-red-600 font-medium"
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 space-y-1">
                <div className="flex items-center gap-2.5 py-1.5 text-sm text-gray-600">
                  <Shield size={14} className="text-gray-400" />
                  <span>Rôle : <strong className="text-gray-800">{roleLabels[user?.role || ''] || user?.role}</strong></span>
                </div>
                <div className="flex items-center gap-2.5 py-1.5 text-sm text-gray-600">
                  <Mail size={14} className="text-gray-400" />
                  <span className="truncate">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2.5 py-1.5 text-sm text-gray-600">
                  <User size={14} className="text-gray-400" />
                  <span>Statut : <span className="text-green-600 font-medium">Actif</span></span>
                </div>
              </div>

              <div className="border-t border-gray-100 mt-1 pt-1 px-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut size={14} />
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
