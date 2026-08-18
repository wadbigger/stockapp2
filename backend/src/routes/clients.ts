import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, type, page, limit } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (search) {
    conditions.push(`(name ILIKE $${i} OR company ILIKE $${i} OR email ILIKE $${i})`)
    params.push(`%${search}%`); i++
  }
  if (type) { conditions.push(`type = $${i}`); params.push(type); i++ }
  if (req.siteId) { conditions.push(`site_id = $${i}`); params.push(req.siteId); i++ }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(`SELECT COUNT(*) FROM clients ${where}`, params)
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT * FROM clients ${where} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/', async (req: AuthRequest, res: Response) => {
  const { type, name, company, email, phone, address, tax_number, notes } = req.body
  const { rows } = await pool.query(
    `INSERT INTO clients (type, name, company, email, phone, address, tax_number, notes, site_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [type || 'client', name, company || '', email || '', phone || '', address || '', tax_number || '', notes || '', req.siteId || null]
  )
  res.status(201).json(rows[0])
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { type, name, company, email, phone, address, tax_number, notes } = req.body
  const { rows } = await pool.query(
    `UPDATE clients SET type=$1, name=$2, company=$3, email=$4, phone=$5, address=$6, tax_number=$7, notes=$8 WHERE id=$9 RETURNING *`,
    [type, name, company || '', email || '', phone || '', address || '', tax_number || '', notes || '', req.params.id]
  )
  res.json(rows[0])
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

router.get('/:id/invoices', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, number, issue_date, due_date, total_ttc, status FROM invoices WHERE client_id=$1 ORDER BY created_at DESC`,
    [req.params.id]
  )
  res.json(rows)
})

export default router
