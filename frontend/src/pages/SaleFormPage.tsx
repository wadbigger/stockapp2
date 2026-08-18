import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle,
  User,
  Package,
} from 'lucide-react'
import api from '../services/api'
import { toast } from '../components/Toast'
import { formatCurrency, today } from '../utils/format'
import type { Client, Product, CompanySettings } from '../types'

interface SaleLine {
  product_id: string
  description: string
  qty: number
  unit_price: string
  discount_pct: string
  vat_rate: string
  stock_available: number
  unit: string
}

export default function SaleFormPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [lines, setLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(false)
  const [stockWarnings, setStockWarnings] = useState<string[]>([])

  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('especes')
  const [markAsPaid, setMarkAsPaid] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/clients?type=client&limit=500'),
      api.get('/products?limit=500&archived=false'),
      api.get('/settings'),
    ]).then(([cRes, pRes, sRes]) => {
      setClients(cRes.data.data || [])
      setProducts(pRes.data.data || [])
      setSettings(sRes.data)
    })
  }, [])

  const defaultVatRate = settings?.default_vat_rate || '18'

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients.slice(0, 20)
    const q = clientSearch.toLowerCase()
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.phone?.includes(q)
    ).slice(0, 20)
  }, [clients, clientSearch])

  const filteredProducts = useMemo(() => {
    const usedIds = new Set(lines.map((l) => l.product_id))
    let list = products.filter((p) => !usedIds.has(p.id) && p.current_stock > 0)
    if (productSearch) {
      const q = productSearch.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    }
    return list.slice(0, 30)
  }, [products, lines, productSearch])

  const addProduct = (product: Product) => {
    setLines((prev) => [
      ...prev,
      {
        product_id: product.id,
        description: product.name,
        qty: 1,
        unit_price: product.sale_price,
        discount_pct: '0',
        vat_rate: defaultVatRate,
        stock_available: product.current_stock,
        unit: product.unit,
      },
    ])
    setProductSearch('')
  }

  const updateLine = (index: number, field: keyof SaleLine, value: any) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    )
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const calcLineHT = (l: SaleLine) => {
    const qty = Number(l.qty) || 0
    const up = Number(l.unit_price) || 0
    const disc = Number(l.discount_pct) || 0
    return qty * up * (1 - disc / 100)
  }

  const subtotalHT = lines.reduce((s, l) => s + calcLineHT(l), 0)
  const totalTVA = lines.reduce((s, l) => {
    return s + calcLineHT(l) * ((Number(l.vat_rate) || 0) / 100)
  }, 0)
  const totalTTC = subtotalHT + totalTVA
  const totalArticles = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)

  const hasStockIssue = lines.some((l) => Number(l.qty) > l.stock_available)

  const selectedClient = clients.find((c) => c.id === clientId)

  const submitSale = async () => {
    if (!clientId) { toast.error('Veuillez sélectionner un client'); return }
    if (lines.length === 0) { toast.error('Ajoutez au moins un produit'); return }

    const warnings: string[] = []
    lines.forEach((l) => {
      if (Number(l.qty) > l.stock_available) {
        warnings.push(`${l.description}: stock ${l.stock_available} ${l.unit}, demandé ${l.qty}`)
      }
    })
    if (warnings.length > 0) {
      setStockWarnings(warnings)
      return
    }

    await doSubmit()
  }

  const doSubmit = async () => {
    setLoading(true)
    setStockWarnings([])
    try {
      const payload = {
        client_id: clientId,
        issue_date: today(),
        due_date: today(),
        payment_method: paymentMethod,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          description: l.description,
          qty: l.qty,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          vat_rate: l.vat_rate,
          total_ht: calcLineHT(l).toFixed(0),
        })),
        subtotal_ht: subtotalHT.toFixed(0),
        total_tva: totalTVA.toFixed(0),
        total_ttc: totalTTC.toFixed(0),
        status: 'emise',
      }

      const res = await api.post('/invoices', payload)

      if (markAsPaid && res.data?.id) {
        await api.post(`/invoices/${res.data.id}/payments`, {
          amount: totalTTC.toFixed(0),
          date: today(),
          method: paymentMethod,
          note: 'Paiement immédiat - vente directe',
        })
      }

      toast.success(`Vente enregistrée ! Facture ${res.data.number}`)
      navigate('/ventes')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur lors de la vente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/ventes')} className="btn-secondary py-2">
          <ArrowLeft size={16} />
          Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouvelle vente</h1>
          <p className="text-sm text-gray-500">Enregistrez une vente et déduisez le stock automatiquement</p>
        </div>
      </div>

      {/* Stock warnings */}
      {stockWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">Stock insuffisant :</p>
              {stockWarnings.map((w, i) => (
                <p key={i} className="text-xs text-red-700">{w}</p>
              ))}
              <div className="mt-3 flex gap-2">
                <button onClick={() => setStockWarnings([])} className="btn-secondary text-sm py-1">Corriger</button>
                <button onClick={doSubmit} className="bg-red-600 text-white text-sm px-3 py-1 rounded-lg hover:bg-red-700 transition-colors">Forcer la vente</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Client + Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client selection */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-gray-400" />
              <h2 className="font-semibold text-gray-800">Client</h2>
            </div>
            {selectedClient ? (
              <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">{selectedClient.name}</p>
                  <p className="text-sm text-gray-500">
                    {[selectedClient.company, selectedClient.phone].filter(Boolean).join(' — ')}
                  </p>
                </div>
                <button onClick={() => setClientId('')} className="text-sm text-red-500 hover:text-red-700">Changer</button>
              </div>
            ) : (
              <div>
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Rechercher un client…"
                    className="input pl-9"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setClientId(c.id); setClientSearch('') }}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-400">{[c.company, c.phone].filter(Boolean).join(' — ')}</p>
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-3">Aucun client trouvé</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Product selector */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} className="text-gray-400" />
              <h2 className="font-semibold text-gray-800">Ajouter des produits</h2>
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Rechercher un produit par nom ou SKU…"
                className="input pl-9"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50/40 transition-colors text-left"
                >
                  <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                    <Package size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sku} — Stock: {p.current_stock} {p.unit}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-primary-600">{formatCurrency(p.sale_price)}</p>
                  </div>
                  <Plus size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4 col-span-2">Aucun produit disponible</p>
              )}
            </div>
          </div>

          {/* Lines */}
          {lines.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Articles ({lines.length})</h2>
              <div className="space-y-3">
                {lines.map((line, i) => {
                  const overStock = Number(line.qty) > line.stock_available
                  return (
                    <div key={line.product_id} className={`p-4 rounded-xl border ${overStock ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800">{line.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Stock: {line.stock_available} {line.unit}
                            {overStock && <span className="text-red-600 font-medium ml-2">— Insuffisant !</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => removeLine(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                          <label className="text-xs text-gray-500">Quantité</label>
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(e) => updateLine(i, 'qty', Number(e.target.value))}
                            className={`input text-sm py-1.5 mt-0.5 ${overStock ? 'border-red-300 focus:ring-red-500' : ''}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Prix unitaire</label>
                          <input
                            type="number"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                            className="input text-sm py-1.5 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Remise %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={line.discount_pct}
                            onChange={(e) => updateLine(i, 'discount_pct', e.target.value)}
                            className="input text-sm py-1.5 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Total HT</label>
                          <p className="text-sm font-semibold text-gray-800 mt-2">{formatCurrency(calcLineHT(line))}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="space-y-6">
          <div className="card sticky top-6">
            <h2 className="font-semibold text-gray-800 mb-4">Récapitulatif</h2>

            {/* Payment method */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 font-medium">Mode de paiement</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="input text-sm mt-1"
              >
                <option value="especes">Espèces</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="carte">Carte bancaire</option>
                <option value="virement">Virement</option>
                <option value="cheque">Chèque</option>
              </select>
            </div>

            {/* Mark as paid */}
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={markAsPaid}
                onChange={(e) => setMarkAsPaid(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Marquer comme payée immédiatement</span>
            </label>

            {/* Totals */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Articles</span>
                <span className="font-medium">{totalArticles}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Sous-total HT</span>
                <span className="font-medium">{formatCurrency(subtotalHT)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>TVA</span>
                <span className="font-medium">{formatCurrency(totalTVA)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3 mt-3">
                <span>Total TTC</span>
                <span className="text-primary-600">{formatCurrency(totalTTC)}</span>
              </div>
            </div>

            {/* Status indicator */}
            {hasStockIssue && (
              <div className="flex items-center gap-2 mt-3 p-2 bg-red-50 rounded-lg">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs text-red-600">Certains articles dépassent le stock disponible</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={submitSale}
              disabled={loading || lines.length === 0}
              className="w-full mt-4 btn-primary justify-center py-3 text-base"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement…
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} />
                  Valider la vente — {formatCurrency(totalTTC)}
                </div>
              )}
            </button>

            <p className="text-xs text-gray-400 text-center mt-2">
              Une facture émise sera générée et le stock sera déduit automatiquement
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
