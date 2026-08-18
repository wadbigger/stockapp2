import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../db/pool'
import platformPool from '../db/platformPool'
import { requireAuth, requireRole, AuthRequest, isSuperAdmin } from '../middleware/auth'
import { normalizeEmail, normalizeLogin } from '../utils/email'

const router = Router()

router.use(requireAuth, requireRole('admin'))

const LOGIN_PATTERN = /^[a-z0-9_.-]{3,50}$/

router.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    'SELECT id, email, login, name, role, active, avatar_url, created_at FROM users ORDER BY created_at DESC'
  )
  res.json(rows)
})

router.post('/', async (req: AuthRequest, res: Response) => {
  const { password, name, role } = req.body
  const email = normalizeEmail(req.body?.email)
  const login = normalizeLogin(req.body?.login)
  if (!login || !email || !password || !name || !role) {
    return res.status(400).json({ message: 'Tous les champs sont requis' })
  }
  if (!LOGIN_PATTERN.test(login)) {
    return res.status(400).json({ message: 'Login invalide (3-50 caractères : lettres, chiffres, points, tirets ou underscores)' })
  }
  if (role === 'superadmin' && !isSuperAdmin(req)) {
    return res.status(403).json({ message: 'Seul un super administrateur peut créer un autre super administrateur' })
  }
  const existing = await pool.query('SELECT id FROM users WHERE LOWER(login) = $1', [login])
  if (existing.rows.length > 0) {
    return res.status(400).json({ message: 'Login déjà utilisé' })
  }
  // platform_user_index maps a login to a single tenant across the whole
  // platform (used by /auth/lookup and /auth/login), so this login must
  // also be free platform-wide, not just within this tenant's own table.
  const platformExisting = await platformPool.query('SELECT 1 FROM platform_user_index WHERE LOWER(login) = $1', [login])
  if (platformExisting.rows.length > 0) {
    return res.status(400).json({ message: 'Ce login est déjà utilisé par un autre compte StockApp' })
  }

  const hash = await bcrypt.hash(password, 10)
  const { rows } = await pool.query(
    'INSERT INTO users (email, login, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, login, name, role, active, avatar_url, created_at',
    [email, login, hash, name, role]
  )

  try {
    await platformPool.query(
      'INSERT INTO platform_user_index (login, email, tenant_id) VALUES ($1, $2, $3)',
      [login, email, req.user!.tenantId]
    )
  } catch (err) {
    // Without this, the user would be created but permanently unable to log
    // in (invisible to /auth/lookup) — roll back rather than leave that trap.
    await pool.query('DELETE FROM users WHERE id = $1', [rows[0].id])
    console.error('Failed to index new user login in platform_user_index:', err)
    return res.status(400).json({ message: 'Ce login est déjà utilisé par un autre compte StockApp' })
  }

  res.status(201).json(rows[0])
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, role, password } = req.body
  const email = normalizeEmail(req.body?.email)
  const login = normalizeLogin(req.body?.login)
  if (role === 'superadmin' && !isSuperAdmin(req)) {
    return res.status(403).json({ message: 'Seul un super administrateur peut attribuer ce rôle' })
  }
  const target = await pool.query('SELECT role, login FROM users WHERE id=$1', [req.params.id])
  if (target.rows.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' })
  if (target.rows[0].role === 'superadmin' && !isSuperAdmin(req)) {
    return res.status(403).json({ message: 'Seul un super administrateur peut modifier un autre super administrateur' })
  }

  const previousLogin = normalizeLogin(target.rows[0].login)
  const loginChanged = login && login !== previousLogin

  if (loginChanged) {
    if (!LOGIN_PATTERN.test(login)) {
      return res.status(400).json({ message: 'Login invalide (3-50 caractères : lettres, chiffres, points, tirets ou underscores)' })
    }
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(login) = $1 AND id <> $2', [login, req.params.id])
    if (dup.rows.length > 0) {
      return res.status(400).json({ message: 'Login déjà utilisé' })
    }
    const platformDup = await platformPool.query('SELECT 1 FROM platform_user_index WHERE LOWER(login) = $1', [login])
    if (platformDup.rows.length > 0) {
      return res.status(400).json({ message: 'Ce login est déjà utilisé par un autre compte StockApp' })
    }
  }

  const finalLogin = login || previousLogin

  if (password) {
    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE users SET name=$1, email=$2, login=$3, role=$4, password_hash=$5 WHERE id=$6', [name, email, finalLogin, role, hash, req.params.id])
  } else {
    await pool.query('UPDATE users SET name=$1, email=$2, login=$3, role=$4 WHERE id=$5', [name, email, finalLogin, role, req.params.id])
  }

  // Keep the platform-wide login->tenant index in sync so this user can
  // still be found by /auth/lookup after a login change.
  if (loginChanged) {
    await platformPool.query('DELETE FROM platform_user_index WHERE LOWER(login) = $1', [previousLogin])
    await platformPool.query(
      'INSERT INTO platform_user_index (login, email, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET login = EXCLUDED.login',
      [finalLogin, email, req.user!.tenantId]
    )
  } else if (email) {
    await platformPool.query('UPDATE platform_user_index SET email = $1 WHERE LOWER(login) = $2', [email, finalLogin])
  }

  const { rows } = await pool.query('SELECT id, email, login, name, role, active, avatar_url, created_at FROM users WHERE id=$1', [req.params.id])
  res.json(rows[0])
})

router.patch('/:id/active', async (req: AuthRequest, res: Response) => {
  const { active } = req.body
  await pool.query('UPDATE users SET active=$1 WHERE id=$2', [active, req.params.id])
  res.json({ success: true })
})

export default router
