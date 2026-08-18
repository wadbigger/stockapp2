import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'
import platformApi from '../../services/platformApi'
import { usePlatformStore } from '../../store/platformStore'
import { toast } from '../../components/Toast'

export default function PlatformLoginPage() {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setToken: saveToken } = usePlatformStore()
  const navigate = useNavigate()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      toast.error('Token requis')
      return
    }
    setLoading(true)
    try {
      await platformApi.get('/tenants', { headers: { Authorization: `Bearer ${token.trim()}` } })
      saveToken(token.trim())
      navigate('/super-admin')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Token invalide')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-xl mb-4">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Panneau plateforme</h1>
          <p className="text-gray-500 mt-1 text-sm">Administration des tenants StockApp</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="label">Token d'administration</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="input pr-10"
                placeholder="PLATFORM_ADMIN_TOKEN"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? 'Vérification…' : 'Accéder au panneau'}
          </button>
        </form>
      </div>
    </div>
  )
}
