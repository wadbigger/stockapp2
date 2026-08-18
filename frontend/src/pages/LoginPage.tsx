import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, WifiOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import { toast } from '../components/Toast'
import ToastContainer from '../components/Toast'
import { applyBranding, resolveLogoSrc } from '../utils/branding'
import { TenantBranding } from '../types'

const credentialsSchema = z.object({
  login: z.string().min(1, 'Login requis'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type CredentialsFormData = z.infer<typeof credentialsSchema>

export default function LoginPage() {
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverOnline, setServerOnline] = useState(true)
  const [branding, setBranding] = useState<TenantBranding | null>(null)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const lastLookedUp = useRef('')

  useEffect(() => {
    const check = () => {
      api.get('/health').then(() => setServerOnline(true)).catch(() => setServerOnline(false))
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsSchema),
  })

  // Best-effort tenant branding preview: fetched quietly as soon as the
  // login field is filled in, without blocking or gating the password
  // field — both are always visible on the same form. Failures (unknown
  // login) are ignored here; the real error surfaces on submit instead.
  const lookupBranding = async (login: string) => {
    const trimmed = login.trim()
    if (!trimmed || trimmed === lastLookedUp.current) return
    lastLookedUp.current = trimmed
    try {
      const res = await api.post('/auth/lookup', { login: trimmed })
      const tenantBranding: TenantBranding = res.data
      setBranding(tenantBranding)
      applyBranding(tenantBranding)
    } catch {
      setBranding(null)
    }
  }

  const onSubmit = async (data: CredentialsFormData) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { login: data.login, password: data.password })
      const { user, accessToken, refreshToken } = res.data
      setAuth(user, accessToken, refreshToken)
      navigate('/')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  const logoSrc = resolveLogoSrc(branding?.logo_url)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-primary-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center leading-none">
          <img
            src={logoSrc || '/logo.png'}
            alt={branding?.name || 'StockApp'}
            className=" block w-56 h-56 mx-auto  object-contain"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              img.onerror = null
              img.src = '/logo.png'
            }}
          />
          <h1 className="text-2xl font-bold text-gray-900">
            {branding?.name ? (
              branding.name
            ) : (
              <>Stock<span style={{ color: 'var(--brand-primary)' }}>App</span></>
            )}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Gestion de stock & facturation</p>
        </div>

        {!serverOnline && (
          <div className="mb-4 flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <WifiOff size={18} className="shrink-0" />
            <div>
              <p className="font-semibold">Serveur indisponible</p>
              <p className="text-xs text-red-500 mt-0.5">Vérifiez que le serveur est démarré. Nouvelle tentative automatique...</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="label">Login</label>
            <input
              type="text"
              {...register('login')}
              onBlur={(e) => { lookupBranding(e.target.value) }}
              className={`input ${errors.login ? 'input-error' : ''}`}
              placeholder="Votre login"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
            />
            {errors.login && <p className="mt-1 text-xs text-red-600">{errors.login.message}</p>}
          </div>

          <div>
            <label className="label">Mot de passe</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                {...register('password')}
                className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !serverOnline}
            className="btn-primary w-full justify-center py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Connexion…' : !serverOnline ? 'Serveur hors ligne' : 'Se connecter'}
          </button>
        </form>
      </div>
      <ToastContainer />
    </div>
  )
}
