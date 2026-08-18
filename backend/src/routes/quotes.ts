import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { generateNumber } from '../services/numberService'
import { generatePDF } from '../services/pdfService'

const router = Router()
router.use(requireAuth)

async function getQuoteWithLines(id: string) {
  const { rows } = await pool.query(
    `SELECT q.*, c.name as client_name, c.company as client_company
     FROM quotes q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id=$1`,
    [id]
  )
  if (!rows[0]) return null
  const { rows: lines } = await pool.query(
    `SELECT ql.*, p.name as product_name FROM quote_lines ql LEFT JOIN products p ON p.id = ql.product_id WHERE ql.quote_id=$1 ORDER BY ql.sort_order`,
    [id]
  )
  return { ...rows[0], lines }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, status, page, limit } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (search) { conditions.push(`(q.number ILIKE $${i} OR c.name ILIKE $${i} OR c.company ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (status) { conditions.push(`q.status = $${i}`); params.push(status); i++ }
  if (req.siteId) { conditions.push(`q.site_id = $${i}`); params.push(req.siteId); i++ }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(`SELECT COUNT(*) FROM quotes q LEFT JOIN clients c ON c.id=q.client_id ${where}`, params)
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT q.*, c.name as client_name, c.company as client_company
     FROM quotes q LEFT JOIN clients c ON c.id=q.client_id
     ${where} ORDER BY q.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { client_id, validity_date, comment, lines, subtotal_ht, total_tva, total_ttc, status } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const number = await generateNumber(client, 'DEV')
    const { rows } = await client.query(
      `INSERT INTO quotes (number, client_id, validity_date, comment, subtotal_ht, total_tva, total_ttc, status, created_by, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [number, client_id, validity_date, comment, subtotal_ht, total_tva, total_ttc, status || 'brouillon', req.user!.id, req.siteId || null]
    )
    const quote = rows[0]
    if (lines?.length) {
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]
        await client.query(
          `INSERT INTO quote_lines (quote_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quote.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
        )
      }
    }
    await client.query('COMMIT')
    res.status(201).json(await getQuoteWithLines(quote.id))
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const quote = await getQuoteWithLines(req.params.id)
  if (!quote) return res.status(404).json({ message: 'Devis non trouvé' })
  res.json(quote)
})

router.put('/:id', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { client_id, validity_date, comment, lines, subtotal_ht, total_tva, total_ttc } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE quotes SET client_id=$1, validity_date=$2, comment=$3, subtotal_ht=$4, total_tva=$5, total_ttc=$6 WHERE id=$7`,
      [client_id, validity_date, comment, subtotal_ht, total_tva, total_ttc, req.params.id]
    )
    await client.query('DELETE FROM quote_lines WHERE quote_id=$1', [req.params.id])
    if (lines?.length) {
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]
        await client.query(
          `INSERT INTO quote_lines (quote_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
        )
      }
    }
    await client.query('COMMIT')
    res.json(await getQuoteWithLines(req.params.id))
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

router.patch('/:id/status', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { status } = req.body
  await pool.query('UPDATE quotes SET status=$1 WHERE id=$2', [status, req.params.id])
  res.json({ success: true })
})

router.post('/:id/convert', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const quote = await getQuoteWithLines(req.params.id)
  if (!quote) return res.status(404).json({ message: 'Devis non trouvé' })
  if (quote.status !== 'accepte') return res.status(400).json({ message: 'Le devis doit être accepté' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const number = await generateNumber(client, 'FAC')
    const today = new Date().toISOString().split('T')[0]
    const due = new Date()
    due.setDate(due.getDate() + 30)
    const dueStr = due.toISOString().split('T')[0]

    const { rows } = await client.query(
      `INSERT INTO invoices (number, client_id, quote_id, issue_date, due_date, subtotal_ht, total_tva, total_ttc, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'brouillon',$9) RETURNING *`,
      [number, quote.client_id, quote.id, today, dueStr, quote.subtotal_ht, quote.total_tva, quote.total_ttc, req.user!.id]
    )
    const invoice = rows[0]
    for (let idx = 0; idx < quote.lines.length; idx++) {
      const l = quote.lines[idx]
      await client.query(
        `INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
      )
    }
    await client.query('COMMIT')
    res.status(201).json(invoice)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

router.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  const quote = await getQuoteWithLines(req.params.id)
  if (!quote) return res.status(404).json({ message: 'Devis non trouvé' })

  const settingsRes = await pool.query('SELECT * FROM company_settings LIMIT 1')
  const settings = settingsRes.rows[0] || {}

  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [quote.client_id])
  const clientData = clientRes.rows[0] || {}

  generatePDF(res, {
    number: quote.number,
    type: 'DEVIS',
    validity_date: quote.validity_date,
    client_name: clientData.name || '',
    client_company: clientData.company,
    client_address: clientData.address,
    client_email: clientData.email,
    subtotal_ht: parseFloat(quote.subtotal_ht),
    total_tva: parseFloat(quote.total_tva),
    total_ttc: parseFloat(quote.total_ttc),
    comment: quote.comment,
    lines: quote.lines.map((l: any) => ({
      description: l.description,
      qty: parseFloat(l.qty),
      unit_price: parseFloat(l.unit_price),
      discount_pct: parseFloat(l.discount_pct),
      vat_rate: parseFloat(l.vat_rate),
      total_ht: parseFloat(l.total_ht),
    })),
  }, settings)
})

export default router
