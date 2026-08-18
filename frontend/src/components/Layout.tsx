import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useEffect } from 'react'
import { useAlertStore } from '../store/alertStore'
import { useSiteStore } from '../store/siteStore'
import api from '../services/api'

export default function Layout() {
  const { setAlerts } = useAlertStore()
  const { setSites, currentSiteId } = useSiteStore()

  useEffect(() => {
    api.get('/sites').then((r) => setSites(r.data || [])).catch(() => {})
  }, [setSites])

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await api.get('/products?alert=true&limit=100')
        setAlerts(res.data.data || [])
      } catch {}
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000)
    return () => clearInterval(interval)
  }, [setAlerts, currentSiteId])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
