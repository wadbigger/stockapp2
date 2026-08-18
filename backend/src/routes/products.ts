import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { sendStockAlert } from '../services/emailService'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, archived, alert, category, sort, order, page, limit } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (search) { conditions.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (archived !== undefined) { conditions.push(`p.archived = $${i}`); params.push(archived === 'true'); i++ }
  if (alert === 'true') { conditions.push(`p.current_stock <= p.alert_threshold`); }
  if (category) {
    conditions.push(`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = $${i})`)
    params.push(category); i++
  }
  if (req.siteId) { conditions.push(`p.site_id = $${i}`); params.push(req.siteId); i++ }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const allowedSort: Record<string, string> = { name: 'p.name', current_stock: 'p.current_stock', created_at: 'p.created_at', sale_price: 'p.sale_price' }
  const sortCol = allowedSort[sort as string] || 'p.name'
  const sortDir = order === 'desc' ? 'DESC' : 'ASC'
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(`SELECT COUNT(*) FROM products p ${where}`, params)
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT p.*,
     COALESCE(
       json_agg(json_build_object('id', c.id, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL),
       '[]'
     ) as categories
     FROM products p
     LEFT JOIN product_categories pc ON pc.product_id = p.id
     LEFT JOIN categories c ON c.id = pc.category_id
     ${where}
     GROUP BY p.id
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { sku, name, category_ids, purchase_price, sale_price, unit, description, alert_threshold, initial_stock } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO products (sku, name, purchase_price, sale_price, unit, description, alert_threshold, current_stock, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sku, name, purchase_price || 0, sale_price || 0, unit, description || '', alert_threshold || 5, initial_stock || 0, req.siteId || null]
    )
    const product = rows[0]
    if (category_ids?.length) {
      for (const cid of category_ids) {
        await client.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [product.id, cid])
      }
    }
    if (initial_stock > 0) {
      await client.query(
        'INSERT INTO stock_movements (product_id, type, quantity, reason, created_by) VALUES ($1,$2,$3,$4,$5)',
        [product.id, 'entree', initial_stock, 'Stock initial', req.user!.id]
      )
    }
    await client.query('COMMIT')
    res.status(201).json(product)
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(400).json({ message: 'SKU déjà utilisé' })
    throw err
  } finally {
    client.release()
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT p.*,
     COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL), '[]') as categories
     FROM products p
     LEFT JOIN product_categories pc ON pc.product_id = p.id
     LEFT JOIN categories c ON c.id = pc.category_id
     WHERE p.id = $1 GROUP BY p.id`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ message: 'Produit non trouvé' })
  res.json(rows[0])
})

router.put('/:id', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { sku, name, category_ids, purchase_price, sale_price, unit, description, alert_threshold } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE products SET sku=$1, name=$2, purchase_price=$3, sale_price=$4, unit=$5, description=$6, alert_threshold=$7 WHERE id=$8 RETURNING *`,
      [sku, name, purchase_price, sale_price, unit, description, alert_threshold, req.params.id]
    )
    await client.query('DELETE FROM product_categories WHERE product_id=$1', [req.params.id])
    if (category_ids?.length) {
      for (const cid of category_ids) {
        await client.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, cid])
      }
    }
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(400).json({ message: 'SKU déjà utilisé' })
    throw err
  } finally {
    client.release()
  }
})

router.patch('/:id/archive', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { archived } = req.body
  await pool.query('UPDATE products SET archived=$1 WHERE id=$2', [archived, req.params.id])
  res.json({ success: true })
})

export default router
