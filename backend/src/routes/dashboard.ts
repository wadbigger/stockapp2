import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

function getPeriodDates(period: string): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().split('T')[0]
  let start: string

  if (period === 'semaine') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    start = d.toISOString().split('T')[0]
  } else if (period === 'trimestre') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    start = d.toISOString().split('T')[0]
  } else if (period === 'annee') {
    start = `${now.getFullYear()}-01-01`
  } else {
    start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }

  return { start, end }
}

router.get('/kpis', async (req: AuthRequest, res: Response) => {
  const period = (req.query.period as string) || 'mois'
  const { start, end } = getPeriodDates(period)
  const siteId = req.siteId
  const siteFilter = siteId ? ' AND site_id = $3' : ''
  const siteParams = siteId ? [start, end, siteId] : [start, end]
  const siteFilterNoDate = siteId ? ' AND site_id = $1' : ''
  const siteParamsNoDate = siteId ? [siteId] : []

  const [caRes, facturesRes, alertRes, attenteRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total_ttc),0) as ca FROM invoices WHERE status IN ('emise','partiellement_payee','payee') AND issue_date BETWEEN $1 AND $2${siteFilter}`,
      siteParams
    ),
    pool.query(
      `SELECT COUNT(*) FROM invoices WHERE status != 'brouillon' AND issue_date BETWEEN $1 AND $2${siteFilter}`,
      siteParams
    ),
    pool.query(
      `SELECT COUNT(*) FROM products WHERE current_stock <= alert_threshold AND archived = false${siteFilterNoDate}`,
      siteParamsNoDate
    ),
    pool.query(
      `SELECT COUNT(*) FROM invoices WHERE status IN ('emise','partiellement_payee')${siteFilterNoDate}`,
      siteParamsNoDate
    ),
  ])

  res.json({
    ca_mois: parseFloat(caRes.rows[0].ca),
    factures_emises: parseInt(facturesRes.rows[0].count),
    produits_alerte: parseInt(alertRes.rows[0].count),
    factures_attente: parseInt(attenteRes.rows[0].count),
  })
})

router.get('/sales', async (req: AuthRequest, res: Response) => {
  const siteId = req.siteId
  const siteFilter = siteId ? ' AND site_id = $1' : ''
  const siteParams = siteId ? [siteId] : []

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', issue_date), 'Mon YYYY') as month,
      TO_CHAR(DATE_TRUNC('month', issue_date), 'YYYY-MM') as month_key,
      COALESCE(SUM(total_ttc),0) as total
    FROM invoices
    WHERE status IN ('emise','partiellement_payee','payee')
      AND issue_date >= NOW() - INTERVAL '12 months'${siteFilter}
    GROUP BY DATE_TRUNC('month', issue_date)
    ORDER BY DATE_TRUNC('month', issue_date)
  `, siteParams)
  res.json(rows.map((r: any) => ({ month: r.month, total: parseFloat(r.total) })))
})

export default router
