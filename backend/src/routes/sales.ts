import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

function addSiteFilter(req: AuthRequest, conditions: string[], params: any[], i: number): number {
  if (req.siteId) { conditions.push(`inv.site_id = $${i}`); params.push(req.siteId); i++ }
  return i
}

router.get('/kpis', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  i = addSiteFilter(req, conditions, params, i)
  conditions.push(`inv.status NOT IN ('brouillon','annulee')`)
  const where = 'WHERE ' + conditions.join(' AND ')

  const caRes = await pool.query(`SELECT COALESCE(SUM(inv.total_ttc), 0) as ca_total FROM invoices inv ${where}`, params)
  const countRes = await pool.query(`SELECT COUNT(*) as total FROM invoices inv ${where}`, params)
  const paidRes = await pool.query(`SELECT COALESCE(SUM(inv.amount_paid), 0) as total_paid FROM invoices inv ${where}`, params)
  const itemsRes = await pool.query(`SELECT COALESCE(SUM(il.qty), 0) as total_items FROM invoice_lines il JOIN invoices inv ON inv.id = il.invoice_id ${where}`, params)
  const unpaidRes = await pool.query(`SELECT COALESCE(SUM(inv.total_ttc - inv.amount_paid), 0) as total_unpaid FROM invoices inv ${where} AND inv.status != 'payee'`, params)

  res.json({
    ca_total: parseFloat(caRes.rows[0].ca_total),
    nb_ventes: parseInt(countRes.rows[0].total),
    total_encaisse: parseFloat(paidRes.rows[0].total_paid),
    total_articles: parseFloat(itemsRes.rows[0].total_items),
    total_impaye: parseFloat(unpaidRes.rows[0].total_unpaid),
  })
})

router.get('/top-products', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to, limit: lim } = req.query
  const conditions: string[] = [`inv.status NOT IN ('brouillon','annulee')`]
  const params: any[] = []
  let i = 1
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  i = addSiteFilter(req, conditions, params, i)
  const where = 'WHERE ' + conditions.join(' AND ')
  const limitNum = parseInt(lim as string) || 10

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.sku, p.sale_price, SUM(il.qty) as total_qty, SUM(il.total_ht) as total_ht
     FROM invoice_lines il JOIN invoices inv ON inv.id = il.invoice_id JOIN products p ON p.id = il.product_id
     ${where} GROUP BY p.id, p.name, p.sku, p.sale_price ORDER BY total_qty DESC LIMIT $${i}`,
    [...params, limitNum]
  )
  res.json(rows)
})

router.get('/top-clients', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to, limit: lim } = req.query
  const conditions: string[] = [`inv.status NOT IN ('brouillon','annulee')`]
  const params: any[] = []
  let i = 1
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  i = addSiteFilter(req, conditions, params, i)
  const where = 'WHERE ' + conditions.join(' AND ')
  const limitNum = parseInt(lim as string) || 10

  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.company, COUNT(inv.id) as nb_factures, SUM(inv.total_ttc) as total_ttc
     FROM invoices inv JOIN clients c ON c.id = inv.client_id
     ${where} GROUP BY c.id, c.name, c.company ORDER BY total_ttc DESC LIMIT $${i}`,
    [...params, limitNum]
  )
  res.json(rows)
})

router.get('/daily', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  const conditions: string[] = [`inv.status NOT IN ('brouillon','annulee')`]
  const params: any[] = []
  let i = 1
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  i = addSiteFilter(req, conditions, params, i)
  const where = 'WHERE ' + conditions.join(' AND ')

  const { rows } = await pool.query(
    `SELECT inv.issue_date::text as date, COUNT(*) as nb, SUM(inv.total_ttc) as total
     FROM invoices inv ${where} GROUP BY inv.issue_date ORDER BY inv.issue_date ASC`,
    params
  )
  res.json(rows)
})

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, client_id, date_from, date_to, page, limit, sort, order } = req.query
  const conditions: string[] = [`inv.status NOT IN ('brouillon','annulee')`]
  const params: any[] = []
  let i = 1

  if (search) { conditions.push(`(inv.number ILIKE $${i} OR c.name ILIKE $${i} OR c.company ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (client_id) { conditions.push(`inv.client_id = $${i}`); params.push(client_id); i++ }
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  i = addSiteFilter(req, conditions, params, i)

  const where = 'WHERE ' + conditions.join(' AND ')
  const sortMap: Record<string, string> = { issue_date: 'inv.issue_date', total_ttc: 'inv.total_ttc', number: 'inv.number', client_name: 'c.name' }
  const sortCol = sortMap[sort as string] || 'inv.issue_date'
  const sortDir = order === 'asc' ? 'ASC' : 'DESC'
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(`SELECT COUNT(*) FROM invoices inv LEFT JOIN clients c ON c.id=inv.client_id ${where}`, params)
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT inv.id, inv.number, inv.status, inv.issue_date, inv.subtotal_ht, inv.total_tva, inv.total_ttc, inv.amount_paid, inv.payment_method,
       c.name as client_name, c.company as client_company, u.name as vendeur_name,
       (SELECT COUNT(*) FROM invoice_lines il WHERE il.invoice_id = inv.id) as nb_lignes,
       (SELECT SUM(il.qty) FROM invoice_lines il WHERE il.invoice_id = inv.id) as total_articles
     FROM invoices inv LEFT JOIN clients c ON c.id = inv.client_id LEFT JOIN users u ON u.id = inv.created_by
     ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/close-day', requireRole('admin', 'comptable', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { date } = req.body
  if (!date) return res.status(400).json({ message: 'Paramètre date requis (YYYY-MM-DD)' })
  const siteId = req.siteId
  if (!siteId) return res.status(400).json({ message: 'Un magasin doit être sélectionné pour clôturer une journée' })
  await pool.query(
    `INSERT INTO closed_days (site_id, closed_date, closed_by) VALUES ($1, $2, $3)
     ON CONFLICT (site_id, closed_date) DO UPDATE SET closed_at = NOW(), closed_by = $3`,
    [siteId, date, req.user!.id]
  )
  res.json({ message: 'Journée clôturée', date })
})

export default router
