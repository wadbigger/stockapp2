import { Router, Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import platformPool from '../db/platformPool'
import { requirePlatformAdmin } from '../middleware/platformAuth'
import { provisionTenant } from '../services/tenantProvisioning'
import { runBackup, restoreBackup, backupFilePath, tenantBackupsDir } from '../services/backupService'

const router = Router()
router.use(requirePlatformAdmin)

// Uploaded restore files are buffered in memory (not written to disk by
// multer directly) since the destination path depends on the tenant slug,
// which we only know once inside the route handler after a DB lookup.
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
})

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_') || 'backup.dump'
}

async function logAudit(tenantId: string | null, action: string, details = ''): Promise<void> {
  try {
    await platformPool.query(
      'INSERT INTO audit_log (tenant_id, action, details) VALUES ($1,$2,$3)',
      [tenantId, action, details]
    )
  } catch (err) {
    console.error('Failed to write audit log entry:', err)
  }
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

router.post('/tenants', async (req: Request, res: Response) => {
  try {
    const { slug, name, adminEmail, adminLogin, adminPassword, primaryColor } = req.body
    if (!slug || !name || !adminEmail || !adminLogin || !adminPassword) {
      return res.status(400).json({ message: 'slug, name, adminEmail, adminLogin et adminPassword sont requis' })
    }
    const result = await provisionTenant({ slug, name, adminEmail, adminLogin, adminPassword, primaryColor })
    res.status(201).json(result)
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Échec du provisioning' })
  }
})

router.get('/tenants', async (_req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    `SELECT t.id, t.slug, t.name, t.db_name, t.status, t.display_name, t.logo_url, t.primary_color, t.created_at,
     s.status as subscription_status, s.amount_monthly, s.currency, s.current_period_end, s.plan_id, p.name as plan_name,
     (SELECT MAX(created_at) FROM backups b WHERE b.tenant_id = t.id AND b.status = 'completed') as last_backup_at
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     LEFT JOIN plans p ON p.id = s.plan_id
     ORDER BY t.created_at DESC`
  )
  res.json(rows)
})

router.get('/tenants/:id', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    `SELECT t.id, t.slug, t.name, t.db_name, t.status, t.display_name, t.logo_url, t.primary_color, t.created_at,
     s.id as subscription_id, s.status as subscription_status, s.amount_monthly, s.currency, s.current_period_end,
     s.plan_id, p.name as plan_name
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.id = $1`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })
  res.json(rows[0])
})

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  const { status, display_name, logo_url, primary_color } = req.body
  const { rows: existing } = await platformPool.query('SELECT id, status FROM tenants WHERE id=$1', [req.params.id])
  if (existing.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })

  const { rows } = await platformPool.query(
    `UPDATE tenants SET
       status = COALESCE($1, status),
       display_name = COALESCE($2, display_name),
       logo_url = COALESCE($3, logo_url),
       primary_color = COALESCE($4, primary_color)
     WHERE id=$5 RETURNING *`,
    [status, display_name, logo_url, primary_color, req.params.id]
  )

  if (status && status !== existing[0].status) {
    const action = status === 'suspended' ? 'tenant_suspended' : status === 'active' ? 'tenant_reactivated' : 'tenant_status_changed'
    await logAudit(req.params.id, action, `${existing[0].status} -> ${status}`)
  }

  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Backups (export) & restore
// ---------------------------------------------------------------------------

router.post('/tenants/:id/backup', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query('SELECT id, slug, db_name FROM tenants WHERE id=$1', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })
  try {
    const result = await runBackup(rows[0], 'manual')
    await logAudit(req.params.id, 'backup_manual', result.filename)
    res.status(201).json({ filename: result.filename, sizeBytes: result.sizeBytes })
  } catch (err: any) {
    res.status(500).json({ message: 'Échec du backup', error: err.message })
  }
})

router.get('/tenants/:id/backups', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    'SELECT id, filename, size_bytes, status, triggered_by, created_at FROM backups WHERE tenant_id=$1 ORDER BY created_at DESC',
    [req.params.id]
  )
  res.json(rows)
})

router.get('/backups/:id/download', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    `SELECT b.filename, t.slug FROM backups b JOIN tenants t ON t.id = b.tenant_id WHERE b.id = $1`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Backup introuvable' })
  const filePath = backupFilePath(rows[0].slug, rows[0].filename)
  res.download(filePath, rows[0].filename)
})

// Restore a tenant's dedicated database from one of its own backups.
// Always takes a fresh "pre-restore" safety backup first, so the operation
// can be undone by restoring that safety backup afterwards if needed.
router.post('/tenants/:id/backups/:backupId/restore', async (req: Request, res: Response) => {
  const { rows: tenantRows } = await platformPool.query(
    'SELECT id, slug, db_name FROM tenants WHERE id=$1',
    [req.params.id]
  )
  if (tenantRows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })
  const tenant = tenantRows[0]

  const { rows: backupRows } = await platformPool.query(
    'SELECT filename FROM backups WHERE id=$1 AND tenant_id=$2',
    [req.params.backupId, req.params.id]
  )
  if (backupRows.length === 0) return res.status(404).json({ message: 'Sauvegarde introuvable pour ce tenant' })

  try {
    await runBackup(tenant, 'pre-restore-safety')
  } catch (err: any) {
    return res.status(500).json({ message: 'Sauvegarde de sécurité pré-restauration échouée, restauration annulée', error: err.message })
  }

  try {
    const filePath = backupFilePath(tenant.slug, backupRows[0].filename)
    await restoreBackup(tenant, filePath)
    await logAudit(req.params.id, 'restore', backupRows[0].filename)
    res.json({ success: true })
  } catch (err: any) {
    await logAudit(req.params.id, 'restore_failed', err.message)
    res.status(500).json({ message: 'Échec de la restauration', error: err.message })
  }
})

// Restore a tenant's dedicated database from an admin-uploaded dump file
// (rather than one of its own previously taken backups). The uploaded file is
// persisted into the tenant's backups directory and tracked in the `backups`
// table (triggered_by='upload') so it also becomes downloadable/re-usable
// afterwards. Same safety-backup precaution as the existing restore route.
router.post('/tenants/:id/restore-upload', restoreUpload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier de sauvegarde requis' })

  const { rows: tenantRows } = await platformPool.query(
    'SELECT id, slug, db_name FROM tenants WHERE id=$1',
    [req.params.id]
  )
  if (tenantRows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })
  const tenant = tenantRows[0]

  try {
    await runBackup(tenant, 'pre-restore-safety')
  } catch (err: any) {
    return res.status(500).json({ message: 'Sauvegarde de sécurité pré-restauration échouée, restauration annulée', error: err.message })
  }

  const filename = `upload-${Date.now()}-${sanitizeFilename(req.file.originalname)}`
  const dir = tenantBackupsDir(tenant.slug)
  const filePath = path.join(dir, filename)

  try {
    fs.writeFileSync(filePath, req.file.buffer)
    await platformPool.query(
      `INSERT INTO backups (tenant_id, filename, size_bytes, status, triggered_by) VALUES ($1,$2,$3,'completed','upload')`,
      [tenant.id, filename, req.file.size]
    )
  } catch (err: any) {
    return res.status(500).json({ message: 'Échec de l\'enregistrement du fichier importé', error: err.message })
  }

  try {
    await restoreBackup(tenant, filePath)
    await logAudit(req.params.id, 'restore_upload', filename)
    res.json({ success: true })
  } catch (err: any) {
    await logAudit(req.params.id, 'restore_upload_failed', err.message)
    res.status(500).json({ message: 'Échec de la restauration (le fichier doit être un dump PostgreSQL au format personnalisé, généré par pg_dump -Fc)', error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

router.get('/plans', async (_req: Request, res: Response) => {
  const { rows } = await platformPool.query('SELECT * FROM plans ORDER BY price_monthly ASC')
  res.json(rows)
})

router.post('/plans', async (req: Request, res: Response) => {
  const { name, price_monthly, currency } = req.body
  if (!name) return res.status(400).json({ message: 'Nom du plan requis' })
  const { rows } = await platformPool.query(
    'INSERT INTO plans (name, price_monthly, currency) VALUES ($1,$2,$3) RETURNING *',
    [name, price_monthly || 0, currency || 'FCFA']
  )
  res.status(201).json(rows[0])
})

router.patch('/plans/:id', async (req: Request, res: Response) => {
  const { name, price_monthly, currency, active } = req.body
  const { rows } = await platformPool.query(
    `UPDATE plans SET
       name = COALESCE($1, name),
       price_monthly = COALESCE($2, price_monthly),
       currency = COALESCE($3, currency),
       active = COALESCE($4, active)
     WHERE id=$5 RETURNING *`,
    [name, price_monthly, currency, active, req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Plan introuvable' })
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Subscriptions (billing)
// ---------------------------------------------------------------------------

router.get('/tenants/:id/subscription', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    `SELECT s.*, p.name as plan_name FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = $1`,
    [req.params.id]
  )
  res.json(rows[0] || null)
})

router.post('/tenants/:id/subscription', async (req: Request, res: Response) => {
  const body = req.body || {}
  const { rows: tenantRows } = await platformPool.query('SELECT id FROM tenants WHERE id=$1', [req.params.id])
  if (tenantRows.length === 0) return res.status(404).json({ message: 'Tenant introuvable' })

  const validStatuses = ['trialing', 'active', 'past_due', 'canceled']
  if (body.status !== undefined && body.status !== null && !validStatuses.includes(body.status)) {
    return res.status(400).json({ message: 'Statut d\'abonnement invalide' })
  }

  // Distinguish "field omitted" (keep existing value) from "field explicitly
  // set to null" (e.g. clearing plan_id) — a plain COALESCE can't tell those
  // apart since both arrive as SQL NULL.
  const hasPlanId = 'plan_id' in body
  const hasStatus = body.status !== undefined
  const hasAmount = body.amount_monthly !== undefined
  const hasCurrency = body.currency !== undefined
  const hasPeriodEnd = 'current_period_end' in body

  const { rows } = await platformPool.query(
    `INSERT INTO subscriptions (tenant_id, plan_id, status, amount_monthly, currency, current_period_end, canceled_at, updated_at)
     VALUES ($1,$2,COALESCE($3,'trialing'),COALESCE($4,0),COALESCE($5,'FCFA'),$6,CASE WHEN $3='canceled' THEN NOW() ELSE NULL END,NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       plan_id = CASE WHEN $7 THEN $2 ELSE subscriptions.plan_id END,
       status = CASE WHEN $8 THEN $3 ELSE subscriptions.status END,
       amount_monthly = CASE WHEN $9 THEN $4 ELSE subscriptions.amount_monthly END,
       currency = CASE WHEN $10 THEN $5 ELSE subscriptions.currency END,
       current_period_end = CASE WHEN $11 THEN $6 ELSE subscriptions.current_period_end END,
       canceled_at = CASE WHEN $8 AND $3 = 'canceled' THEN NOW() WHEN $8 THEN NULL ELSE subscriptions.canceled_at END,
       updated_at = NOW()
     RETURNING *`,
    [
      req.params.id,
      body.plan_id ?? null,
      body.status ?? null,
      body.amount_monthly ?? null,
      body.currency ?? null,
      body.current_period_end ?? null,
      hasPlanId,
      hasStatus,
      hasAmount,
      hasCurrency,
      hasPeriodEnd,
    ]
  )
  await logAudit(req.params.id, 'subscription_updated', JSON.stringify({
    plan_id: body.plan_id, status: body.status, amount_monthly: body.amount_monthly, currency: body.currency,
  }))
  res.json(rows[0])
})

// ---------------------------------------------------------------------------
// Platform-wide stats: tenant counts, subscription breakdown, MRR
// ---------------------------------------------------------------------------

router.get('/stats', async (_req: Request, res: Response) => {
  const tenantCounts = await platformPool.query(
    `SELECT status, COUNT(*)::int as count FROM tenants GROUP BY status`
  )
  const subscriptionCounts = await platformPool.query(
    `SELECT status, COUNT(*)::int as count FROM subscriptions GROUP BY status`
  )
  const mrr = await platformPool.query(
    `SELECT currency, COALESCE(SUM(amount_monthly),0)::float as amount
     FROM subscriptions WHERE status = 'active' GROUP BY currency`
  )
  const totalTenants = await platformPool.query('SELECT COUNT(*)::int as count FROM tenants')
  const backupsLast24h = await platformPool.query(
    `SELECT COUNT(*)::int as count FROM backups WHERE created_at > NOW() - INTERVAL '24 hours' AND status='completed'`
  )
  const backupsFailedLast7d = await platformPool.query(
    `SELECT COUNT(*)::int as count FROM backups WHERE created_at > NOW() - INTERVAL '7 days' AND status='failed'`
  )

  res.json({
    tenants: {
      total: totalTenants.rows[0].count,
      byStatus: tenantCounts.rows.reduce((acc: any, r: any) => ({ ...acc, [r.status]: r.count }), {}),
    },
    subscriptions: {
      byStatus: subscriptionCounts.rows.reduce((acc: any, r: any) => ({ ...acc, [r.status]: r.count }), {}),
    },
    mrr: mrr.rows.map((r: any) => ({ currency: r.currency, amount: r.amount })),
    backups: {
      last24h: backupsLast24h.rows[0].count,
      failedLast7d: backupsFailedLast7d.rows[0].count,
    },
  })
})

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

router.get('/audit-log', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const { rows } = await platformPool.query(
    `SELECT a.id, a.tenant_id, t.name as tenant_name, a.action, a.details, a.created_at
     FROM audit_log a LEFT JOIN tenants t ON t.id = a.tenant_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  )
  res.json(rows)
})

router.get('/tenants/:id/audit-log', async (req: Request, res: Response) => {
  const { rows } = await platformPool.query(
    `SELECT id, action, details, created_at FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.id]
  )
  res.json(rows)
})

export default router
