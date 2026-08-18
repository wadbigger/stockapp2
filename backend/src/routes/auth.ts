import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import platformPool from '../db/platformPool'
import { getTenantPool, TenantRow } from '../db/tenantPoolManager'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimit'
import { normalizeLogin } from '../utils/email'

const router = Router()

const uploadsRoot = path.join(__dirname, '../../uploads')

const avatarStorage = multer.diskStorage({
  destination: (req: any, _file, cb) => {
    const dir = path.join(uploadsRoot, req.tenantSlug || 'unknown', 'avatars')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `avatar_${req.user?.id || 'unknown'}_${Date.now()}${ext}`)
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Format non supporté. Utilisez PNG, JPG, GIF ou WEBP.'))
  },
})

async function resolveTenantByLogin(login: string): Promise<TenantRow & { status: string } | null> {
  const { rows } = await platformPool.query(
    `SELECT t.id, t.slug, t.db_name, t.status
     FROM platform_user_index pui
     JOIN tenants t ON t.id = pui.tenant_id
     WHERE LOWER(pui.login) = $1`,
    [normalizeLogin(login)]
  )
  return rows[0] || null
}

// Step 1 of login: resolve which tenant this login belongs to and return
// just enough branding to render a branded password step (no subdomain needed).
router.post('/lookup', authLimiter, async (req: Request, res: Response) => {
  const login = normalizeLogin(req.body?.login)
  if (!login) return res.status(400).json({ message: 'Login requis' })

  const { rows } = await platformPool.query(
    `SELECT t.id as tenant_id, t.display_name, t.logo_url, t.primary_color
     FROM platform_user_index pui
     JOIN tenants t ON t.id = pui.tenant_id
     WHERE LOWER(pui.login) = $1 AND t.status = 'active'`,
    [login]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Compte introuvable' })

  const row = rows[0]
  res.json({
    tenantId: row.tenant_id,
    name: row.display_name,
    logo_url: row.logo_url,
    primary_color: row.primary_color,
  })
})

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const login = normalizeLogin(req.body?.login)
  const { password } = req.body
  if (!login || !password) {
    return res.status(400).json({ message: 'Login et mot de passe requis' })
  }

  const tenant = await resolveTenantByLogin(login)
  if (!tenant || tenant.status !== 'active') {
    return res.status(401).json({ message: 'Login ou mot de passe incorrect' })
  }

  const tenantPool = getTenantPool(tenant)
  const { rows } = await tenantPool.query('SELECT * FROM users WHERE LOWER(login) = $1 AND active = true', [login])
  const user = rows[0]

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Login ou mot de passe incorrect' })
  }

  const accessToken = jwt.sign(
    { id: user.id, role: user.role, email: user.email, login: user.login, tenantId: tenant.id },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  )
  const refreshToken = jwt.sign(
    { id: user.id, tenantId: tenant.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  )

  await tenantPool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id])

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, login: user.login, name: user.name, role: user.role, active: user.active, avatar_url: user.avatar_url || '', tenantId: tenant.id },
  })
})

router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token manquant' })

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any
    if (!payload.tenantId) return res.status(401).json({ message: 'Token invalide' })

    const { rows: tenantRows } = await platformPool.query(
      "SELECT id, slug, db_name, status FROM tenants WHERE id = $1",
      [payload.tenantId]
    )
    const tenant = tenantRows[0]
    if (!tenant || tenant.status !== 'active') return res.status(403).json({ message: 'Compte suspendu' })

    const tenantPool = getTenantPool(tenant)
    const { rows } = await tenantPool.query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND active = true',
      [payload.id, refreshToken]
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ message: 'Token invalide' })

    const newAccessToken = jwt.sign(
      { id: user.id, role: user.role, email: user.email, login: user.login, tenantId: tenant.id },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    )
    const newRefreshToken = jwt.sign({ id: user.id, tenantId: tenant.id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' })
    await tenantPool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id])

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
  } catch {
    res.status(401).json({ message: 'Token expiré ou invalide' })
  }
})

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  await pool.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [req.user!.id])
  res.json({ message: 'Déconnecté' })
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query('SELECT id, email, login, name, role, active, avatar_url, created_at FROM users WHERE id = $1', [req.user!.id])
  res.json(rows[0])
})

router.post('/avatar', requireAuth, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' })

  const avatarUrl = `/uploads/${req.tenantSlug}/avatars/${req.file.filename}`
  const userId = req.user!.id

  const { rows: existing } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId])
  if (existing[0]?.avatar_url && existing[0].avatar_url.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, '../../', existing[0].avatar_url)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId])
  res.json({ avatar_url: avatarUrl })
})

router.delete('/avatar', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const { rows } = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId])
  if (rows[0]?.avatar_url && rows[0].avatar_url.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, '../../', rows[0].avatar_url)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', ['', userId])
  res.json({ success: true })
})

export default router
