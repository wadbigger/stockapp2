import { Router, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import platformPool from '../db/platformPool'
import { runBackup } from '../services/backupService'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

const uploadsRoot = path.join(__dirname, '../../uploads')

const storage = multer.diskStorage({
  destination: (req: any, _file, cb) => {
    const dir = path.join(uploadsRoot, req.tenantSlug || 'unknown')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `logo_${Date.now()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Format non supporté. Utilisez PNG, JPG, GIF, SVG ou WEBP.'))
  },
})

// Best-effort mirror of branding into the control-plane `tenants` row, used by
// the pre-login /auth/lookup branding screen. Never blocks the tenant-facing response.
async function syncBrandingToControlPlane(tenantId: string, fields: { name?: string; logo_url?: string; primary_color?: string }) {
  try {
    await platformPool.query(
      `UPDATE tenants SET
         display_name = COALESCE($1, display_name),
         logo_url = COALESCE($2, logo_url),
         primary_color = COALESCE($3, primary_color)
       WHERE id = $4`,
      [fields.name, fields.logo_url, fields.primary_color, tenantId]
    )
  } catch (err) {
    console.error('Failed to sync branding to control plane:', err)
  }
}

router.post('/logo', requireRole('admin'), upload.single('logo'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' })

  const logoUrl = `/uploads/${req.tenantSlug}/${req.file.filename}`

  const existing = await pool.query('SELECT id, logo_url FROM company_settings LIMIT 1')
  if (existing.rows.length > 0) {
    const old = existing.rows[0].logo_url
    if (old && old.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '../../', old)
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }
    await pool.query('UPDATE company_settings SET logo_url=$1, updated_at=NOW() WHERE id=$2', [logoUrl, existing.rows[0].id])
  } else {
    await pool.query('INSERT INTO company_settings (logo_url) VALUES ($1)', [logoUrl])
  }

  await syncBrandingToControlPlane(req.user!.tenantId, { logo_url: logoUrl })

  res.json({ logo_url: logoUrl })
})

router.get('/', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1')
  res.json(rows[0] || {})
})

router.put('/', async (req: AuthRequest, res: Response) => {
  const { name, logo_url, address, siret, vat_number, default_vat_rate, currency, email, phone, website, legal_mentions, primary_color } = req.body
  const existing = await pool.query('SELECT id FROM company_settings LIMIT 1')
  let row
  if (existing.rows.length === 0) {
    const { rows } = await pool.query(
      `INSERT INTO company_settings (name, logo_url, address, siret, vat_number, default_vat_rate, currency, email, phone, website, legal_mentions, primary_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, logo_url, address, siret, vat_number, default_vat_rate || 18, currency || 'FCFA', email, phone, website, legal_mentions, primary_color || '#2563eb']
    )
    row = rows[0]
  } else {
    const { rows } = await pool.query(
      `UPDATE company_settings SET name=$1, logo_url=$2, address=$3, siret=$4, vat_number=$5, default_vat_rate=$6, currency=$7, email=$8, phone=$9, website=$10, legal_mentions=$11, primary_color=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, logo_url, address, siret, vat_number, default_vat_rate || 18, currency || 'FCFA', email, phone, website, legal_mentions, primary_color || '#2563eb', existing.rows[0].id]
    )
    row = rows[0]
  }

  await syncBrandingToControlPlane(req.user!.tenantId, { name, logo_url, primary_color })

  res.json(row)
})

// Tenant self-service backup: any admin can download a fresh dump of their own data.
router.post('/backup', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await platformPool.query('SELECT id, slug, db_name FROM tenants WHERE id = $1', [req.user!.tenantId])
    if (rows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })
    const result = await runBackup(rows[0], 'tenant-admin')
    res.download(result.filePath, result.filename)
  } catch (err: any) {
    console.error(`Backup request failed for tenant ${req.tenantSlug}:`, err)
    res.status(500).json({ message: 'Échec du backup, veuillez contacter le support.' })
  }
})

export default router
