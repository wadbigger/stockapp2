import { Routes, Route, Navigate } from 'react-router-dom'
import ToastContainer from './components/Toast'
import { useAuthStore } from './store/authStore'
import { usePlatformStore } from './store/platformStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import PlatformLoginPage from './pages/platform/PlatformLoginPage'
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import StockPage from './pages/StockPage'
import AlertsPage from './pages/AlertsPage'
import ClientsPage from './pages/ClientsPage'
import QuotesPage from './pages/QuotesPage'
import QuoteFormPage from './pages/QuoteFormPage'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceFormPage from './pages/InvoiceFormPage'
import SalesPage from './pages/SalesPage'
import SaleFormPage from './pages/SaleFormPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import SitesPage from './pages/SitesPage'
import UsersPage from './pages/UsersPage'
import SynthesisPage from './pages/SynthesisPage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/" replace />
  return children
}

// Guards the platform (super-admin) panel: gated by a shared platform admin
// token, entirely independent from the per-tenant JWT auth used everywhere
// else in the app (see PlatformLoginPage / platformStore).
function RequirePlatformToken({ children }: { children: JSX.Element }) {
  const { token } = usePlatformStore()
  if (!token) return <Navigate to="/super-admin/login" replace />
  return children
}

export default function App() {
  const { user } = useAuthStore()

  return (
    <>
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/super-admin/login" element={<PlatformLoginPage />} />
      <Route
        path="/super-admin"
        element={
          <RequirePlatformToken>
            <PlatformDashboardPage />
          </RequirePlatformToken>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="alertes" element={<AlertsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="ventes" element={<SalesPage />} />
        <Route path="ventes/nouvelle" element={<SaleFormPage />} />
        <Route path="devis" element={<QuotesPage />} />
        <Route path="devis/nouveau" element={<QuoteFormPage />} />
        <Route path="devis/:id/modifier" element={<QuoteFormPage />} />
        <Route path="factures" element={<InvoicesPage />} />
        <Route path="factures/nouvelle" element={<InvoiceFormPage />} />
        <Route path="factures/:id/modifier" element={<InvoiceFormPage />} />
        <Route path="rapports" element={<ReportsPage />} />
        <Route path="synthese" element={<SynthesisPage />} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route
          path="sites"
          element={
            <RequireAdmin>
              <SitesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="utilisateurs"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <ToastContainer />
    </>
  )
}
