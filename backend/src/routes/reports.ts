import { Router, Response } from 'express'
import * as XLSX from 'xlsx'
import pool from '../db/pool'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth, requireRole('admin', 'comptable', 'gestionnaire', 'vendeur'))

function sendExcel(res: Response, sheetName: string, data: any[], filename: string) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buf)
}

router.get('/invoices', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to, status } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (date_from) { conditions.push(`inv.issue_date >= $${i++}`); params.push(date_from) }
  if (date_to) { conditions.push(`inv.issue_date <= $${i++}`); params.push(date_to) }
  if (status) { conditions.push(`inv.status = $${i++}`); params.push(status) }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const { rows } = await pool.query(
    `SELECT inv.number as "Numéro", c.name as "Client", c.company as "Entreprise",
     inv.issue_date as "Date émission", inv.due_date as "Échéance",
     inv.subtotal_ht as "Sous-total HT", inv.total_tva as "TVA", inv.total_ttc as "Total TTC",
     inv.amount_paid as "Montant payé",
     CASE inv.status
       WHEN 'brouillon' THEN 'Brouillon'
       WHEN 'emise' THEN 'Émise'
       WHEN 'partiellement_payee' THEN 'Partiellement payée'
       WHEN 'payee' THEN 'Payée'
       WHEN 'annulee' THEN 'Annulée'
       ELSE inv.status
     END as "Statut",
     inv.payment_method as "Mode paiement"
     FROM invoices inv LEFT JOIN clients c ON c.id=inv.client_id
     ${where} ORDER BY inv.issue_date DESC`,
    params
  )
  sendExcel(res, 'Factures', rows, 'factures.xlsx')
})

router.get('/stock', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(`
    SELECT p.sku as "SKU", p.name as "Produit", p.unit as "Unité",
    p.current_stock as "Stock actuel",
    p.purchase_price as "Prix achat unitaire (FCFA)",
    (p.current_stock * p.purchase_price)::DECIMAL(15,2) as "Valorisation stock (FCFA)",
    p.sale_price as "Prix vente (FCFA)",
    p.alert_threshold as "Seuil alerte",
    CASE WHEN p.current_stock <= p.alert_threshold THEN 'OUI' ELSE 'NON' END as "En alerte"
    FROM products p WHERE p.archived = false ORDER BY p.name
  `)
  sendExcel(res, 'Stock', rows, 'stock.xlsx')
})

router.get('/vat', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  const conditions = [`inv.status IN ('emise','partiellement_payee','payee')`]
  const params: any[] = []
  let i = 1

  if (date_from) { conditions.push(`inv.issue_date >= $${i++}`); params.push(date_from) }
  if (date_to) { conditions.push(`inv.issue_date <= $${i++}`); params.push(date_to) }

  const where = 'WHERE ' + conditions.join(' AND ')
  const { rows } = await pool.query(
    `SELECT inv.number as "Numéro facture", c.name as "Client",
     inv.issue_date as "Date",
     inv.subtotal_ht as "Base HT",
     il.vat_rate as "Taux TVA (%)",
     ROUND(SUM(il.total_ht * il.vat_rate / 100), 2) as "TVA collectée"
     FROM invoices inv
     LEFT JOIN clients c ON c.id=inv.client_id
     LEFT JOIN invoice_lines il ON il.invoice_id=inv.id
     ${where} GROUP BY inv.id, c.name, il.vat_rate ORDER BY inv.issue_date DESC`,
    params
  )
  sendExcel(res, 'TVA', rows, 'tva.xlsx')
})

router.get('/movements', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  if (date_from) { conditions.push(`sm.date >= $${i++}`); params.push(date_from) }
  if (date_to) { conditions.push(`sm.date <= $${i++}`); params.push(date_to) }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const { rows } = await pool.query(
    `SELECT sm.date as "Date", p.sku as "SKU", p.name as "Produit",
     CASE sm.type WHEN 'entree' THEN 'Entrée' WHEN 'sortie' THEN 'Sortie' WHEN 'vente' THEN 'Vente' ELSE 'Ajustement' END as "Type",
     sm.quantity as "Quantité", p.unit as "Unité",
     sm.reason as "Motif", sm.supplier_ref as "Réf. fournisseur",
     inv.number as "Facture liée", u.name as "Effectué par"
     FROM stock_movements sm
     LEFT JOIN products p ON p.id=sm.product_id
     LEFT JOIN invoices inv ON inv.id=sm.invoice_id
     LEFT JOIN users u ON u.id=sm.created_by
     ${where} ORDER BY sm.date DESC, sm.created_at DESC`,
    params
  )
  sendExcel(res, 'Mouvements', rows, 'mouvements.xlsx')
})

async function fetchDailySalesData(date: string, siteId?: string) {
  const siteFilter = siteId ? 'AND inv.site_id = $2' : ''
  const siteFilterInvoices = siteId ? 'AND site_id = $2' : ''
  const params = siteId ? [date, siteId] : [date]
  const { rows } = await pool.query(
    `SELECT COALESCE(c.name, 'Non classé') as category_name, p.name as product_name, p.unit,
     SUM(il.qty)::decimal as qty,
     ROUND(SUM(il.total_ht) / NULLIF(SUM(il.qty), 0), 0)::decimal as unit_price,
     0 as discount_pct,
     SUM(il.total_ht)::decimal as valeur
     FROM invoice_lines il
     JOIN invoices inv ON inv.id = il.invoice_id
     LEFT JOIN products p ON p.id = il.product_id
     LEFT JOIN product_categories pc ON pc.product_id = p.id
     LEFT JOIN categories c ON c.id = pc.category_id
     WHERE inv.issue_date = $1 AND inv.status NOT IN ('brouillon','annulee') ${siteFilter}
     GROUP BY c.name, p.id, p.name, p.unit
     ORDER BY c.name NULLS LAST, p.name`,
    params
  )
  const lastInvRes = await pool.query(
    `SELECT number FROM invoices WHERE issue_date = $1 AND status NOT IN ('brouillon','annulee') ${siteFilterInvoices}
     ORDER BY created_at DESC LIMIT 1`,
    params
  )
  let journeeCloturee = false
  if (siteId) {
    try {
      const closedRes = await pool.query(
        'SELECT 1 FROM closed_days WHERE closed_date = $1 AND site_id = $2',
        [date, siteId]
      )
      journeeCloturee = closedRes.rows.length > 0
    } catch {
      journeeCloturee = false
    }
  }
  const categories: Record<string, any[]> = {}
  let totalQty = 0
  let totalVal = 0
  for (const r of rows) {
    const cat = r.category_name
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(r)
    totalQty += parseFloat(r.qty) || 0
    totalVal += parseFloat(r.valeur) || 0
  }
  return {
    categories,
    totalQty,
    totalVal,
    lastInvoiceNumber: lastInvRes.rows[0]?.number || null,
    journeeCloturee,
  }
}

router.get('/daily-sales/pdf', async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ message: 'Paramètre date requis (YYYY-MM-DD)' })
    const data = await fetchDailySalesData(date as string, req.siteId)
    let siteName = 'Tous les magasins'
    if (req.siteId) {
      const siteRes = await pool.query('SELECT name FROM sites WHERE id = $1', [req.siteId])
      if (siteRes.rows[0]) siteName = siteRes.rows[0].name
    }
    const settingsRes = await pool.query('SELECT * FROM company_settings LIMIT 1')
    const company = settingsRes.rows[0] || {}

    const PDFDocument = require('pdfkit')
    const path = require('path')
    const fs = require('fs')

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 30 })
      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const fmtNum = (v: number) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      const fmtDate = (d: string) => {
        const p = String(d).split('-')
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(-2)}` : d
      }

      const uploadsDir = path.join(__dirname, '../../uploads')
      const logoPath = company.logo_url?.startsWith('/uploads/')
        ? path.join(uploadsDir, path.basename(company.logo_url))
        : null
      if (logoPath && fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 30, 20, { width: 45 }) } catch {}
      }
      doc.fontSize(12).font('Helvetica-Bold').text(company.name || 'Mon Entreprise', 85, 22)
      doc.fontSize(8).font('Helvetica').text(company.address || '', 85, 36)
      doc.fontSize(14).font('Helvetica-Bold').text('VENTES JOURNALIERES', 0, 55, { width: 535, align: 'center' })
      doc.fontSize(9).font('Helvetica')
      doc.text(`Période du ${fmtDate(date as string)} au ${fmtDate(date as string)}`, 0, 72, { width: 535, align: 'center' })
      doc.text('Magasin', 400, 55)
      doc.text(siteName, 400, 65)

      const startY = 95
      const cols = { desc: 30, qty: 350, pu: 400, remise: 450, valeur: 500 }
      doc.rect(30, startY, 535, 18).fill('#e5e7eb')
      doc.fillColor('#333').fontSize(8).font('Helvetica-Bold')
      doc.text('Désignation', cols.desc + 4, startY + 4)
      doc.text('Quantité', cols.qty, startY + 4, { width: 45, align: 'right' })
      doc.text('P.U', cols.pu, startY + 4, { width: 45, align: 'right' })
      doc.text('Remise', cols.remise, startY + 4, { width: 45, align: 'right' })
      doc.text('Valeur', cols.valeur, startY + 4, { width: 35, align: 'right' })

      let y = startY + 20
      const pageH = 842 - 60
      for (const [catName, lines] of Object.entries(data.categories)) {
        if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
        doc.fillColor('#333').fontSize(9).font('Helvetica-Bold').text(catName, cols.desc + 4, y)
        y += 14
        for (const l of lines as any[]) {
          if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
          doc.fillColor('#111').fontSize(8).font('Helvetica')
          doc.text(l.product_name || '-', cols.desc + 4, y, { width: 310 })
          doc.text(parseFloat(l.qty).toFixed(2), cols.qty, y, { width: 45, align: 'right' })
          doc.text(fmtNum(parseFloat(l.unit_price)), cols.pu, y, { width: 45, align: 'right' })
          doc.text(String(l.discount_pct || 0), cols.remise, y, { width: 45, align: 'right' })
          doc.text(fmtNum(parseFloat(l.valeur)), cols.valeur, y, { width: 35, align: 'right' })
          y += 12
        }
        let catQty = 0
        let catVal = 0
        for (const l of lines as any[]) {
          catQty += parseFloat(l.qty) || 0
          catVal += parseFloat(l.valeur) || 0
        }
        doc.font('Helvetica-Bold')
        doc.text('Sous-total', cols.desc + 4, y)
        doc.text(catQty.toFixed(2), cols.qty, y, { width: 45, align: 'right' })
        doc.text(fmtNum(catVal), cols.valeur, y, { width: 35, align: 'right' })
        doc.font('Helvetica')
        y += 16
      }

      if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
      doc.rect(30, y, 535, 20).fill('#e5e7eb')
      doc.fillColor('#111').fontSize(10).font('Helvetica-Bold')
      doc.text('Total', cols.desc + 4, y + 5)
      doc.text(data.totalQty.toFixed(2), cols.qty, y + 5, { width: 45, align: 'right' })
      doc.text(fmtNum(data.totalVal), cols.valeur, y + 5, { width: 35, align: 'right' })
      y += 28

      doc.fontSize(9).font('Helvetica')
      doc.text(`Nº de la dernière facture: ${data.lastInvoiceNumber || '-'}`, 30, y)
      y += 18
      if (!data.journeeCloturee) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#b91c1c')
        doc.text('Fiche de vente non valide', 30, y)
        doc.fillColor('#111')
        y += 20
      }

      y += 15
      const now = new Date()
      const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
      const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
      doc.font('Helvetica').fontSize(7).text(
        `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
        30, y
      )
      doc.text('Page 1 sur 1', 535, y, { align: 'right' })
      doc.end()
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="ventes_journalieres_${date}.pdf"`)
    res.setHeader('Content-Length', String(pdfBuffer.length))
    res.send(pdfBuffer)
  } catch (err) {
    console.error('Erreur PDF ventes journalières:', err)
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur lors de la génération du PDF' })
    }
  }
})

router.get('/daily-sales', async (req: AuthRequest, res: Response) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ message: 'Paramètre date requis (YYYY-MM-DD)' })
  const data = await fetchDailySalesData(date as string, req.siteId)
  let siteName = 'Tous les magasins'
  if (req.siteId) {
    const siteRes = await pool.query('SELECT name FROM sites WHERE id = $1', [req.siteId])
    if (siteRes.rows[0]) siteName = siteRes.rows[0].name
  }
  const settingsRes = await pool.query('SELECT * FROM company_settings LIMIT 1')
  const company = settingsRes.rows[0] || {}
  res.json({ ...data, siteName, company, date })
})

async function fetchSynthesisData(date_from: string, date_to: string, siteId?: string) {
  const siteFilter = siteId ? 'AND p.site_id = $3' : ''
  const smSiteFilter = siteId ? 'AND sm.site_id = $3' : ''
  const baseParams = siteId ? [date_from, date_to, siteId] : [date_from, date_to]

  const { rows } = await pool.query(`
    WITH period_mv AS (
      SELECT sm.product_id,
        SUM(CASE WHEN sm.type = 'entree' THEN sm.quantity ELSE 0 END) as approv,
        SUM(CASE WHEN sm.type = 'vente'  THEN sm.quantity ELSE 0 END) as ventes,
        SUM(CASE WHEN sm.type = 'sortie' THEN sm.quantity ELSE 0 END) as sorties,
        SUM(CASE WHEN sm.type = 'ajustement' THEN sm.quantity ELSE 0 END) as ecart
      FROM stock_movements sm
      WHERE sm.date >= $1 AND sm.date <= $2 ${smSiteFilter}
      GROUP BY sm.product_id
    ),
    after_mv AS (
      SELECT sm.product_id,
        SUM(CASE WHEN sm.type = 'entree' THEN sm.quantity ELSE 0 END) as entrees_after,
        SUM(CASE WHEN sm.type IN ('vente','sortie') THEN sm.quantity ELSE 0 END) as sorties_after
      FROM stock_movements sm
      WHERE sm.date > $2 ${smSiteFilter}
      GROUP BY sm.product_id
    )
    SELECT
      p.id, p.sku, p.name, p.unit, p.current_stock,
      COALESCE(c.name, 'Non classé') as category_name,
      COALESCE(pm.approv, 0)::int as approv,
      COALESCE(pm.ventes, 0)::int as ventes,
      COALESCE(pm.sorties, 0)::int as sorties,
      COALESCE(pm.ecart, 0)::int as ecart,
      (p.current_stock - COALESCE(am.entrees_after, 0) + COALESCE(am.sorties_after, 0))::int as stock_final,
      (p.current_stock - COALESCE(am.entrees_after, 0) + COALESCE(am.sorties_after, 0)
        - COALESCE(pm.approv, 0) - COALESCE(pm.ecart, 0)
        + COALESCE(pm.ventes, 0) + COALESCE(pm.sorties, 0))::int as stock_initial
    FROM products p
    LEFT JOIN product_categories pc ON pc.product_id = p.id
    LEFT JOIN categories c ON c.id = pc.category_id
    LEFT JOIN period_mv pm ON pm.product_id = p.id
    LEFT JOIN after_mv am ON am.product_id = p.id
    WHERE p.archived = false ${siteFilter}
    ORDER BY c.name NULLS LAST, p.name
  `, baseParams)

  const categories: Record<string, any[]> = {}
  for (const row of rows) {
    const cat = row.category_name
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(row)
  }

  let siteName = 'Tous les magasins'
  if (siteId) {
    const siteRes = await pool.query('SELECT name FROM sites WHERE id = $1', [siteId])
    if (siteRes.rows[0]) siteName = siteRes.rows[0].name
  }

  const settingsRes = await pool.query('SELECT * FROM company_settings LIMIT 1')
  const company = settingsRes.rows[0] || {}

  return { categories, siteName, company, date_from, date_to }
}

router.get('/synthesis', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  if (!date_from || !date_to) return res.status(400).json({ message: 'date_from et date_to requis' })
  const data = await fetchSynthesisData(date_from as string, date_to as string, req.siteId)
  res.json(data)
})

router.get('/synthesis/pdf', async (req: AuthRequest, res: Response) => {
  const { date_from, date_to } = req.query
  if (!date_from || !date_to) return res.status(400).json({ message: 'date_from et date_to requis' })

  const { categories, siteName, company } = await fetchSynthesisData(date_from as string, date_to as string, req.siteId)

  const PDFDocument = require('pdfkit')
  const path = require('path')
  const fs = require('fs')
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 30 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="synthese_${date_from}_${date_to}.pdf"`)
  doc.pipe(res)

  const cols = [
    { label: 'PRODUITS', x: 30, w: 95 },
    { label: 'Stock Initial (A)', x: 125, w: 38 },
    { label: 'Approv.', x: 163, w: 38 },
    { label: 'Récep.', x: 201, w: 38 },
    { label: 'Ecart\nd\'invent.', x: 239, w: 38 },
    { label: 'Ventes', x: 277, w: 38 },
    { label: 'Retour/\nAnnulat.', x: 315, w: 38 },
    { label: 'Exp.', x: 353, w: 38 },
    { label: 'Stock Final (A+B-C)', x: 391, w: 44 },
  ]

  const drawCell = (x: number, y: number, w: number, h: number, fill?: string) => {
    doc.strokeColor('#333').lineWidth(0.5)
    if (fill) doc.fillColor(fill).rect(x, y, w, h).fillAndStroke(fill, '#333')
    else doc.rect(x, y, w, h).stroke()
  }
  const drawCellNoTop = (x: number, y: number, w: number, h: number, fill?: string) => {
    doc.strokeColor('#333').lineWidth(0.5)
    if (fill) doc.fillColor(fill).rect(x, y, w, h).fill()
    doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke()
    doc.moveTo(x, y + h).lineTo(x, y).stroke()
    doc.moveTo(x + w, y + h).lineTo(x + w, y).stroke()
  }

  // Logo
  const logoPath = company.logo_url ? path.join(__dirname, '../../', company.logo_url) : null
  if (logoPath && company.logo_url.startsWith('/uploads/') && fs.existsSync(logoPath)) {
    try { doc.image(logoPath, 30, 20, { width: 45 }) } catch {}
  }

  // Header
  doc.fontSize(10).font('Helvetica-Bold').text(company.name || 'Mon Entreprise', 85, 22)
  doc.fontSize(7).font('Helvetica').text(company.address || '', 85, 34)

  const pageW = 595
  doc.fontSize(12).font('Helvetica-Bold').text('TABLEAU DE SYNTHESE PAR MAGASIN', 0, 22, { width: pageW, align: 'center' })

  const fmtDate = (d: string) => { const p = String(d).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }
  doc.fontSize(8).font('Helvetica')
  doc.text(`Date début  ${fmtDate(date_from as string)}       Date Fin  ${fmtDate(date_to as string)}`, 0, 40, { width: pageW, align: 'center' })

  doc.fontSize(8).font('Helvetica-Bold').text(`Magasin`, 420, 22)
  doc.fontSize(7).font('Helvetica').text(siteName, 420, 32)

  // Table
  const startY = 65
  const rowH = 10
  const headerH = 12

  // En-tête : toutes les cellules fusionnées sur 2 lignes (une seule cellule PRODUITS, pas de doublon)
  const entreesW = 114
  const sortiesW = 114
  const mergedH = headerH + rowH
  const headerY = startY + headerH

  // PRODUITS : une seule cellule fusionnée sur 2 lignes
  drawCell(cols[0].x, startY, cols[0].w, mergedH, '#e5e7eb')
  doc.fillColor('#333').fontSize(5).font('Helvetica-Bold')
  doc.text('PRODUITS', cols[0].x + 2, startY + (mergedH / 2) - 2, { width: cols[0].w - 4, align: 'center' })
  // Stock Initial : fusionné avec la zone du haut (sans bordure supérieure)
  drawCellNoTop(cols[1].x, startY, cols[1].w, mergedH, '#e5e7eb')
  drawCell(cols[8].x, startY, cols[8].w, mergedH, '#e5e7eb')
  doc.text('Stock Initial (A)', cols[1].x + 2, startY + 2, { width: cols[1].w - 4, align: 'center' })
  doc.text('Stock Final (A+B-C)', cols[8].x + 2, startY + 2, { width: cols[8].w - 4, align: 'center' })
  // Entrées et Sorties : fusionnés sur 2 lignes
  drawCell(163, startY, entreesW, mergedH, '#e5e7eb')
  drawCell(277, startY, sortiesW, mergedH, '#e5e7eb')
  doc.text('Entrées de stock (B)', 163, startY + 2, { width: entreesW - 4, align: 'center' })
  doc.text('Sorties de stocks (C)', 277, startY + 2, { width: sortiesW - 4, align: 'center' })
  // Sous-colonnes (Approv, Récep, etc.) : dessinées DANS les cellules Entrées/Sorties
  for (let ci = 2; ci <= 7; ci++) {
    drawCell(cols[ci].x, headerY, cols[ci].w, rowH, '#f3f4f6')
  }
  doc.fillColor('#333').fontSize(5).font('Helvetica-Bold')
  for (let ci = 2; ci <= 7; ci++) {
    doc.text(cols[ci].label, cols[ci].x + 2, headerY + 2, { width: cols[ci].w - 4, align: 'center' })
  }

  let y = headerY + rowH
  let totals = { stock_initial: 0, approv: 0, ecart: 0, ventes: 0, sorties: 0, stock_final: 0 }
  const pageH = 842 - 60

  const tableWidth = cols[8].x + cols[8].w - cols[0].x
  for (const [catName, products] of Object.entries(categories)) {
    if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
    drawCell(cols[0].x, y, tableWidth, rowH, '#f9fafb')
    doc.fillColor('#333').fontSize(6).font('Helvetica-Bold').text(catName, cols[0].x + 2, y + 2, { width: tableWidth - 4, align: 'left' })
    y += rowH

    for (const p of products as any[]) {
      if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
      for (let ci = 0; ci < cols.length; ci++) {
        drawCell(cols[ci].x, y, cols[ci].w, rowH)
      }
      doc.fillColor('#111').fontSize(5).font('Helvetica')
      doc.text(p.name, cols[0].x + 2, y + 2, { width: cols[0].w - 4, align: 'left', lineBreak: false })
      const vals = [p.stock_initial, p.approv, 0, p.ecart, p.ventes, 0, p.sorties, p.stock_final]
      for (let ci = 1; ci < cols.length; ci++) {
        const v = vals[ci - 1]
        if (v) doc.text(String(v), cols[ci].x + 2, y + 2, { width: cols[ci].w - 4, align: 'center' })
      }
      totals.stock_initial += p.stock_initial
      totals.approv += p.approv
      totals.ecart += p.ecart
      totals.ventes += p.ventes
      totals.sorties += p.sorties
      totals.stock_final += p.stock_final
      y += rowH
    }
  }

  // Totals
  if (y > pageH) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 30 }); y = 30 }
  for (let ci = 0; ci < cols.length; ci++) {
    drawCell(cols[ci].x, y, cols[ci].w, rowH + 2, '#e5e7eb')
  }
  doc.fillColor('#111').fontSize(6).font('Helvetica-Bold')
  doc.text('TOTAUX', cols[0].x + 2, y + 2, { width: cols[0].w - 4, align: 'left' })
  const tVals = [totals.stock_initial, totals.approv, 0, totals.ecart, totals.ventes, 0, totals.sorties, totals.stock_final]
  const tShow = [true, !!totals.approv, false, !!totals.ecart, !!totals.ventes, false, !!totals.sorties, true]
  for (let ci = 1; ci < cols.length; ci++) {
    const v = tVals[ci - 1]
    const show = tShow[ci - 1]
    doc.text(show ? String(v) : '', cols[ci].x + 2, y + 3, { width: cols[ci].w - 4, align: 'center' })
  }
  y += rowH + 20

  // Control
  doc.font('Helvetica-Bold').fontSize(9)
  doc.text(`CONTROLE       ${totals.stock_final.toFixed(2)}`, 0, y, { width: pageW, align: 'center' })
  y += 14
  const diff = totals.stock_final - (totals.stock_initial + totals.approv + totals.ecart - totals.ventes - totals.sorties)
  doc.text(`DIFF                 ${diff.toFixed(2)}`, 0, y, { width: pageW, align: 'center' })

  // Date footer
  y += 25
  const now = new Date()
  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  doc.font('Helvetica').fontSize(7).text(
    `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
    30, y
  )
  doc.text('Page 1 sur 1', 565, y, { align: 'right' })

  doc.end()
})

export default router
