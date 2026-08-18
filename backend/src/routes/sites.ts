import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest, isAdminOrSuper } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  if (isAdminOrSuper(req)) {
    const { rows } = await pool.query('SELECT * FROM sites ORDER BY created_at ASC')
    return res.json(rows)
  }
  const { rows } = await pool.query(
    `SELECT s.* FROM sites s
     JOIN user_sites us ON us.site_id = s.id
     WHERE us.user_id = $1 AND s.active = true
     ORDER BY s.created_at ASC`,
    [req.user!.id]
  )
  res.json(rows)
})

router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name, address, phone, email } = req.body
  if (!name) return res.status(400).json({ message: 'Nom requis' })
  const { rows } = await pool.query(
    'INSERT INTO sites (name, address, phone, email) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, address || '', phone || '', email || '']
  )
  await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user!.id, rows[0].id])
  // Auto-assign all superadmins to the new site
  const superadmins = await pool.query("SELECT id FROM users WHERE role = 'superadmin'")
  for (const sa of superadmins.rows) {
    await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [sa.id, rows[0].id])
  }
  res.status(201).json(rows[0])
})

router.put('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { name, address, phone, email, active } = req.body
  const { rows } = await pool.query(
    'UPDATE sites SET name=$1, address=$2, phone=$3, email=$4, active=COALESCE($5, active) WHERE id=$6 RETURNING *',
    [name, address, phone, email, active, req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ message: 'Site non trouvé' })
  res.json(rows[0])
})

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const countRes = await pool.query('SELECT COUNT(*) FROM sites')
  if (parseInt(countRes.rows[0].count) <= 1) {
    return res.status(400).json({ message: 'Impossible de supprimer le dernier site' })
  }
  await pool.query('DELETE FROM sites WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

router.get('/:id/users', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.avatar_url
     FROM users u
     JOIN user_sites us ON us.user_id = u.id
     WHERE us.site_id = $1
     ORDER BY u.name`,
    [req.params.id]
  )
  res.json(rows)
})

router.post('/:id/users', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { user_ids } = req.body
  if (!Array.isArray(user_ids)) return res.status(400).json({ message: 'user_ids requis' })
  await pool.query('DELETE FROM user_sites WHERE site_id = $1', [req.params.id])
  for (const uid of user_ids) {
    await pool.query('INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, req.params.id])
  }
  res.json({ success: true })
})

export default router
