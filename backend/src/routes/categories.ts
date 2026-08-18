import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY name')
  res.json(rows)
})

router.post('/', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body
  const { rows } = await pool.query(
    'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
    [name, description || '']
  )
  res.status(201).json(rows[0])
})

router.put('/:id', requireRole('admin', 'gestionnaire'), async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body
  const { rows } = await pool.query(
    'UPDATE categories SET name=$1, description=$2 WHERE id=$3 RETURNING *',
    [name, description || '', req.params.id]
  )
  res.json(rows[0])
})

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

export default router
