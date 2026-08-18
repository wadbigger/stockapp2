import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { sendStockAlert } from '../services/emailService'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, type, product_id, date_from, date_to, page, limit } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (search) { conditions.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (type) { conditions.push(`sm.type = $${i}`); params.push(type); i++ }
  if (product_id) { conditions.push(`sm.product_id = $${i}`); params.push(product_id); i++ }
  if (date_from) { conditions.push(`sm.date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`sm.date <= $${i}`); params.push(date_to); i++ }
  if (req.siteId) { conditions.push(`sm.site_id = $${i}`); params.push(req.siteId); i++ }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM stock_movements sm LEFT JOIN products p ON p.id = sm.product_id ${where}`,
    params
  )
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT sm.*, p.name as product_name, p.sku as product_sku,
     u.name as created_by_name, inv.number as invoice_number
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     LEFT JOIN users u ON u.id = sm.created_by
     LEFT JOIN invoices inv ON inv.id = sm.invoice_id
     ${where}
     ORDER BY sm.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { product_id, type, quantity, reason, date, supplier_ref } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const productRes = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [product_id])
    const product = productRes.rows[0]
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })

    if (type === 'sortie' && product.current_stock < quantity) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: `Stock insuffisant. Stock disponible : ${product.current_stock} ${product.unit}`,
      })
    }

    let delta = type === 'entree' ? quantity : type === 'sortie' ? -quantity : 0
    if (type === 'ajustement') delta = quantity - product.current_stock

    await client.query('UPDATE products SET current_stock = current_stock + $1 WHERE id = $2', [delta, product_id])

    const { rows } = await client.query(
      `INSERT INTO stock_movements (product_id, type, quantity, reason, date, supplier_ref, created_by, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [product_id, type, Math.abs(delta !== 0 ? delta : quantity), reason, date || new Date(), supplier_ref || '', req.user!.id, req.siteId || null]
    )

    const newStock = product.current_stock + delta
    if (newStock <= product.alert_threshold) {
      sendStockAlert(product.name, newStock, product.alert_threshold).catch(() => {})
    }

    await client.query('COMMIT')
    res.status(201).json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

export default router
