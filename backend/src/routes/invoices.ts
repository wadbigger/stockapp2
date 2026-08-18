import { Router, Response } from 'express'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { generateNumber } from '../services/numberService'
import { generatePDF } from '../services/pdfService'
import { sendStockAlert } from '../services/emailService'

const router = Router()
router.use(requireAuth)

async function getInvoiceWithLines(id: string) {
  const { rows } = await pool.query(
    `SELECT inv.*, c.name as client_name, c.company as client_company
     FROM invoices inv LEFT JOIN clients c ON c.id = inv.client_id WHERE inv.id=$1`,
    [id]
  )
  if (!rows[0]) return null
  const { rows: lines } = await pool.query(
    `SELECT il.*, p.name as product_name FROM invoice_lines il LEFT JOIN products p ON p.id = il.product_id WHERE il.invoice_id=$1 ORDER BY il.sort_order`,
    [id]
  )
  const { rows: payments } = await pool.query('SELECT * FROM payments WHERE invoice_id=$1 ORDER BY date DESC', [id])
  return { ...rows[0], lines, payments }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const { search, status, client_id, date_from, date_to, page, limit, sort, order } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (search) { conditions.push(`(inv.number ILIKE $${i} OR c.name ILIKE $${i} OR c.company ILIKE $${i})`); params.push(`%${search}%`); i++ }
  if (status) { conditions.push(`inv.status = $${i}`); params.push(status); i++ }
  if (client_id) { conditions.push(`inv.client_id = $${i}`); params.push(client_id); i++ }
  if (date_from) { conditions.push(`inv.issue_date >= $${i}`); params.push(date_from); i++ }
  if (date_to) { conditions.push(`inv.issue_date <= $${i}`); params.push(date_to); i++ }
  if (req.siteId) { conditions.push(`inv.site_id = $${i}`); params.push(req.siteId); i++ }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const sortMap: Record<string, string> = { created_at: 'inv.created_at', number: 'inv.number', issue_date: 'inv.issue_date', total_ttc: 'inv.total_ttc' }
  const sortCol = sortMap[sort as string] || 'inv.created_at'
  const sortDir = order === 'asc' ? 'ASC' : 'DESC'
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  const countRes = await pool.query(`SELECT COUNT(*) FROM invoices inv LEFT JOIN clients c ON c.id=inv.client_id ${where}`, params)
  const total = parseInt(countRes.rows[0].count)

  const { rows } = await pool.query(
    `SELECT inv.*, c.name as client_name, c.company as client_company
     FROM invoices inv LEFT JOIN clients c ON c.id=inv.client_id
     ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limitNum, offset]
  )

  res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
})

router.post('/check-stock', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { lines } = req.body
  const warnings: string[] = []
  for (const line of lines || []) {
    if (!line.product_id) continue
    const { rows } = await pool.query('SELECT name, current_stock, unit FROM products WHERE id=$1', [line.product_id])
    const product = rows[0]
    if (!product) continue
    if (product.current_stock < line.qty) {
      warnings.push(`${product.name}: stock disponible ${product.current_stock} ${product.unit}, demandé ${line.qty}`)
    }
  }
  res.json({ warnings })
})

router.post('/', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { client_id, issue_date, due_date, payment_method, lines, subtotal_ht, total_tva, total_ttc, status } = req.body
  const dbClient = await pool.connect()
  try {
    await dbClient.query('BEGIN')
    const number = await generateNumber(dbClient, 'FAC')
    const { rows } = await dbClient.query(
      `INSERT INTO invoices (number, client_id, issue_date, due_date, payment_method, subtotal_ht, total_tva, total_ttc, status, created_by, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [number, client_id, issue_date, due_date, payment_method || 'virement', subtotal_ht, total_tva, total_ttc, status || 'brouillon', req.user!.id, req.siteId || null]
    )
    const invoice = rows[0]
    if (lines?.length) {
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]
        await dbClient.query(
          `INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [invoice.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
        )
      }
    }
    if (status === 'emise') {
      await deductStock(dbClient, invoice.id, lines, req.user!.id, req.siteId)
    }
    await dbClient.query('COMMIT')
    res.status(201).json(await getInvoiceWithLines(invoice.id))
  } catch (err: any) {
    await dbClient.query('ROLLBACK')
    return res.status(400).json({ message: err.message })
  } finally {
    dbClient.release()
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const invoice = await getInvoiceWithLines(req.params.id)
  if (!invoice) return res.status(404).json({ message: 'Facture non trouvée' })
  res.json(invoice)
})

router.put('/:id', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { client_id, issue_date, due_date, payment_method, lines, subtotal_ht, total_tva, total_ttc, status } = req.body
  const dbClient = await pool.connect()
  try {
    await dbClient.query('BEGIN')
    const existing = await dbClient.query('SELECT status FROM invoices WHERE id=$1', [req.params.id])
    const prevStatus = existing.rows[0]?.status

    await dbClient.query(
      `UPDATE invoices SET client_id=$1, issue_date=$2, due_date=$3, payment_method=$4, subtotal_ht=$5, total_tva=$6, total_ttc=$7, status=$8 WHERE id=$9`,
      [client_id, issue_date, due_date, payment_method, subtotal_ht, total_tva, total_ttc, status || 'brouillon', req.params.id]
    )
    await dbClient.query('DELETE FROM invoice_lines WHERE invoice_id=$1', [req.params.id])
    if (lines?.length) {
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]
        await dbClient.query(
          `INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
        )
      }
    }
    if (prevStatus === 'brouillon' && status === 'emise') {
      await deductStock(dbClient, req.params.id, lines, req.user!.id, req.siteId)
    }
    await dbClient.query('COMMIT')
    res.json(await getInvoiceWithLines(req.params.id))
  } catch (err: any) {
    await dbClient.query('ROLLBACK')
    return res.status(400).json({ message: err.message })
  } finally {
    dbClient.release()
  }
})

router.patch('/:id/status', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const { status } = req.body
  const dbClient = await pool.connect()
  try {
    await dbClient.query('BEGIN')
    const existing = await dbClient.query('SELECT status FROM invoices WHERE id=$1', [req.params.id])
    const prevStatus = existing.rows[0]?.status

    await dbClient.query('UPDATE invoices SET status=$1 WHERE id=$2', [status, req.params.id])

    if (status === 'annulee' && prevStatus === 'emise') {
      const { rows: lines } = await dbClient.query('SELECT * FROM invoice_lines WHERE invoice_id=$1', [req.params.id])
      for (const line of lines) {
        if (!line.product_id) continue
        await dbClient.query('UPDATE products SET current_stock = current_stock + $1 WHERE id=$2', [line.qty, line.product_id])
        await dbClient.query(
          'DELETE FROM stock_movements WHERE invoice_id=$1 AND product_id=$2',
          [req.params.id, line.product_id]
        )
      }
    }
    await dbClient.query('COMMIT')
    res.json({ success: true })
  } catch (err) {
    await dbClient.query('ROLLBACK')
    throw err
  } finally {
    dbClient.release()
  }
})

router.post('/:id/payments', requireRole('admin', 'vendeur', 'comptable'), async (req: AuthRequest, res: Response) => {
  const { amount, date, method, note } = req.body
  const dbClient = await pool.connect()
  try {
    await dbClient.query('BEGIN')
    await dbClient.query(
      'INSERT INTO payments (invoice_id, amount, date, method, note) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, amount, date, method, note || '']
    )
    const res2 = await dbClient.query(
      'SELECT SUM(amount) as total FROM payments WHERE invoice_id=$1',
      [req.params.id]
    )
    const totalPaid = parseFloat(res2.rows[0].total || 0)
    const invRes = await dbClient.query('SELECT total_ttc FROM invoices WHERE id=$1', [req.params.id])
    const totalTTC = parseFloat(invRes.rows[0].total_ttc)

    let newStatus = 'emise'
    if (totalPaid >= totalTTC) newStatus = 'payee'
    else if (totalPaid > 0) newStatus = 'partiellement_payee'

    await dbClient.query('UPDATE invoices SET amount_paid=$1, status=$2 WHERE id=$3', [totalPaid, newStatus, req.params.id])
    await dbClient.query('COMMIT')
    res.json({ success: true, amount_paid: totalPaid, status: newStatus })
  } catch (err) {
    await dbClient.query('ROLLBACK')
    throw err
  } finally {
    dbClient.release()
  }
})

router.post('/:id/duplicate', requireRole('admin', 'vendeur'), async (req: AuthRequest, res: Response) => {
  const original = await getInvoiceWithLines(req.params.id)
  if (!original) return res.status(404).json({ message: 'Facture non trouvée' })

  const dbClient = await pool.connect()
  try {
    await dbClient.query('BEGIN')
    const number = await generateNumber(dbClient, 'FAC')
    const today = new Date().toISOString().split('T')[0]
    const due = new Date()
    due.setDate(due.getDate() + 30)
    const dueStr = due.toISOString().split('T')[0]

    const { rows } = await dbClient.query(
      `INSERT INTO invoices (number, client_id, issue_date, due_date, payment_method, subtotal_ht, total_tva, total_ttc, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'brouillon',$9) RETURNING *`,
      [number, original.client_id, today, dueStr, original.payment_method, original.subtotal_ht, original.total_tva, original.total_ttc, req.user!.id]
    )
    const invoice = rows[0]
    for (let idx = 0; idx < original.lines.length; idx++) {
      const l = original.lines[idx]
      await dbClient.query(
        `INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, discount_pct, vat_rate, total_ht, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, l.product_id || null, l.description, l.qty, l.unit_price, l.discount_pct, l.vat_rate, l.total_ht, idx]
      )
    }
    await dbClient.query('COMMIT')
    res.status(201).json(invoice)
  } catch (err) {
    await dbClient.query('ROLLBACK')
    throw err
  } finally {
    dbClient.release()
  }
})

router.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  const invoice = await getInvoiceWithLines(req.params.id)
  if (!invoice) return res.status(404).json({ message: 'Facture non trouvée' })

  const settingsRes = await pool.query('SELECT * FROM company_settings LIMIT 1')
  const settings = settingsRes.rows[0] || {}
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [invoice.client_id])
  const clientData = clientRes.rows[0] || {}

  generatePDF(res, {
    number: invoice.number,
    type: 'FACTURE',
    issue_date: invoice.issue_date,
    issue_time: invoice.created_at,
    due_date: invoice.due_date,
    payment_method: invoice.payment_method,
    client_name: clientData.name || '',
    client_company: clientData.company,
    client_address: clientData.address,
    client_email: clientData.email,
    subtotal_ht: parseFloat(invoice.subtotal_ht),
    total_tva: parseFloat(invoice.total_tva),
    total_ttc: parseFloat(invoice.total_ttc),
    lines: invoice.lines.map((l: any) => ({
      description: l.description,
      qty: parseFloat(l.qty),
      unit_price: parseFloat(l.unit_price),
      discount_pct: parseFloat(l.discount_pct),
      vat_rate: parseFloat(l.vat_rate),
      total_ht: parseFloat(l.total_ht),
    })),
  }, settings)
})

async function deductStock(dbClient: any, invoiceId: string, lines: any[], userId: string, siteId?: string) {
  for (const line of lines || []) {
    if (!line.product_id || !line.qty) continue
    const prodRes = await dbClient.query('SELECT current_stock, name, unit FROM products WHERE id=$1 FOR UPDATE', [line.product_id])
    const product = prodRes.rows[0]
    if (!product) continue
    if (product.current_stock < line.qty) {
      throw new Error(`Stock insuffisant pour "${product.name}": disponible ${product.current_stock} ${product.unit}`)
    }
    await dbClient.query('UPDATE products SET current_stock = current_stock - $1 WHERE id=$2', [line.qty, line.product_id])
    await dbClient.query(
      `INSERT INTO stock_movements (product_id, type, quantity, reason, invoice_id, created_by, site_id)
       VALUES ($1,'vente',$2,'Vente facturée',$3,$4,$5)`,
      [line.product_id, line.qty, invoiceId, userId, siteId || null]
    )
    const newStock = product.current_stock - line.qty
    const alertRes = await dbClient.query('SELECT alert_threshold FROM products WHERE id=$1', [line.product_id])
    if (alertRes.rows[0] && newStock <= alertRes.rows[0].alert_threshold) {
      sendStockAlert(product.name, newStock, alertRes.rows[0].alert_threshold).catch(() => {})
    }
  }
}

export default router
