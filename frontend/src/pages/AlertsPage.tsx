import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import api from '../services/api'
import { formatCurrency } from '../utils/format'
import type { Product } from '../types'
import { useSiteStore } from '../store/siteStore'

export default function AlertsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const { currentSiteId } = useSiteStore()

  useEffect(() => {
    setLoading(true)
    api
      .get('/products?alert=true&limit=100&archived=false')
      .then((r) => setProducts(r.data.data || []))
      .finally(() => setLoading(false))
  }, [currentSiteId])

  const ruptures = products.filter((p) => p.current_stock === 0)
  const bas = products.filter((p) => p.current_stock > 0 && p.current_stock <= p.alert_threshold)

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Chargement…</div>
  }

  return (
    <div className="space-y-6">
      {products.length === 0 ? (
        <div className="card text-center py-12">
          <Package size={48} className="mx-auto text-green-400 mb-3" />
          <h3 className="text-lg font-semibold text-gray-700">Aucune alerte</h3>
          <p className="text-gray-400 mt-1">Tous les produits ont un stock suffisant.</p>
        </div>
      ) : (
        <>
          {ruptures.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <h3 className="font-semibold text-gray-800">Ruptures de stock ({ruptures.length})</h3>
              </div>
              <div className="table-container bg-white">
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produit</th>
                      <th>Catégorie</th>
                      <th>Stock actuel</th>
                      <th>Seuil d'alerte</th>
                      <th>Prix d'achat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruptures.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-gray-500 text-xs">{p.categories?.map(c => c.name).join(', ')}</td>
                        <td>
                          <span className="badge bg-red-100 text-red-700 font-bold">0 {p.unit}</span>
                        </td>
                        <td className="text-gray-500">{p.alert_threshold}</td>
                        <td>{formatCurrency(p.purchase_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bas.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 bg-orange-500 rounded-full" />
                <h3 className="font-semibold text-gray-800">Stock bas ({bas.length})</h3>
              </div>
              <div className="table-container bg-white">
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produit</th>
                      <th>Catégorie</th>
                      <th>Stock actuel</th>
                      <th>Seuil d'alerte</th>
                      <th>Prix d'achat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bas.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-gray-500 text-xs">{p.categories?.map(c => c.name).join(', ')}</td>
                        <td>
                          <span className="badge bg-orange-100 text-orange-700 font-bold">{p.current_stock} {p.unit}</span>
                        </td>
                        <td className="text-gray-500">{p.alert_threshold}</td>
                        <td>{formatCurrency(p.purchase_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
