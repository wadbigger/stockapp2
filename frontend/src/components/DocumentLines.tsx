import { Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '../utils/format'
import type { Product } from '../types'

export interface LineItem {
  product_id: string
  description: string
  qty: number
  unit_price: string
  discount_pct: string
  vat_rate: string
  total_ht: string
}

interface Props {
  lines: LineItem[]
  products: Product[]
  defaultVatRate: string
  onChange: (lines: LineItem[]) => void
}

function calcTotalHT(line: LineItem): number {
  const qty = Number(line.qty) || 0
  const up = Number(line.unit_price) || 0
  const disc = Number(line.discount_pct) || 0
  return qty * up * (1 - disc / 100)
}

export default function DocumentLines({ lines, products, defaultVatRate, onChange }: Props) {
  const addLine = () => {
    onChange([
      ...lines,
      { product_id: '', description: '', qty: 1, unit_price: '0', discount_pct: '0', vat_rate: defaultVatRate, total_ht: '0' },
    ])
  }

  const updateLine = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = lines.map((l, i) => {
      if (i !== index) return l
      const newLine = { ...l, [field]: value }
      if (field === 'product_id') {
        const product = products.find((p) => p.id === value)
        if (product) {
          newLine.description = product.name
          newLine.unit_price = product.sale_price
        }
      }
      newLine.total_ht = calcTotalHT(newLine).toFixed(0)
      return newLine
    })
    onChange(updated)
  }

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index))
  }

  const subtotalHT = lines.reduce((sum, l) => sum + calcTotalHT(l), 0)
  const totalTVA = lines.reduce((sum, l) => {
    const ht = calcTotalHT(l)
    const vat = Number(l.vat_rate) || 0
    return sum + ht * (vat / 100)
  }, 0)
  const totalTTC = subtotalHT + totalTVA

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-3 py-2 text-left w-1/4">Produit</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right w-16">Qté</th>
              <th className="px-3 py-2 text-right w-28">Prix unit.</th>
              <th className="px-3 py-2 text-right w-20">Remise %</th>
              <th className="px-3 py-2 text-right w-20">TVA %</th>
              <th className="px-3 py-2 text-right w-28">Total HT</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-400 text-sm">
                  Aucune ligne. Cliquez sur "Ajouter une ligne".
                </td>
              </tr>
            ) : (
              lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-1 py-1">
                    <select
                      value={line.product_id}
                      onChange={(e) => updateLine(i, 'product_id', e.target.value)}
                      className="input text-xs py-1"
                    >
                      <option value="">— Sélectionner —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      className="input text-xs py-1"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min="1"
                      value={line.qty}
                      onChange={(e) => updateLine(i, 'qty', Number(e.target.value))}
                      className="input text-xs py-1 text-right w-full"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      value={line.unit_price}
                      onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                      className="input text-xs py-1 text-right w-full"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={line.discount_pct}
                      onChange={(e) => updateLine(i, 'discount_pct', e.target.value)}
                      className="input text-xs py-1 text-right w-full"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={line.vat_rate}
                      onChange={(e) => updateLine(i, 'vat_rate', e.target.value)}
                      className="input text-xs py-1 text-right w-full"
                    />
                  </td>
                  <td className="px-3 py-1 text-right font-semibold text-gray-700 whitespace-nowrap">
                    {formatCurrency(calcTotalHT(line))}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addLine} className="btn-secondary text-sm py-1.5">
        <Plus size={14} />
        Ajouter une ligne
      </button>

      <div className="flex justify-end">
        <div className="bg-gray-50 rounded-xl p-4 w-72 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Sous-total HT</span>
            <span className="font-medium">{formatCurrency(subtotalHT)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>TVA</span>
            <span className="font-medium">{formatCurrency(totalTVA)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
            <span>Total TTC</span>
            <span className="text-primary-600">{formatCurrency(totalTTC)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
