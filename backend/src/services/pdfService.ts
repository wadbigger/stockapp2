import PDFDocument from 'pdfkit'
import { Response } from 'express'
import path from 'path'
import fs from 'fs'

interface CompanySettings {
  name: string
  address: string
  email: string
  phone: string
  siret: string
  vat_number: string
  currency: string
  legal_mentions: string
  logo_url?: string
  website?: string
}

interface DocumentLine {
  description: string
  qty: number
  unit_price: number
  discount_pct: number
  vat_rate: number
  total_ht: number
}

interface DocumentData {
  number: string
  type: 'DEVIS' | 'FACTURE'
  issue_date?: string
  issue_time?: string
  validity_date?: string
  due_date?: string
  payment_method?: string
  client_name: string
  client_company?: string
  client_address?: string
  client_email?: string
  client_phone?: string
  subtotal_ht: number
  total_tva: number
  total_ttc: number
  lines: DocumentLine[]
  comment?: string
}

function fmtNum(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtMoney(value: number, currency = 'FCFA'): string {
  const num = fmtNum(value)
  if (!currency) return num
  return num + ' ' + currency
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR')
}

function formatDateWithTime(dateStr: string, timeStr?: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const datePart = d.toLocaleDateString('fr-FR')
  if (timeStr) {
    try {
      const t = new Date(timeStr)
      const h = String(t.getHours()).padStart(2, '0')
      const m = String(t.getMinutes()).padStart(2, '0')
      return `${datePart} à ${h}:${m}`
    } catch {
      return datePart
    }
  }
  return datePart
}

function numberToWordsFr(n: number): string {
  const int = Math.floor(Math.abs(n))
  if (int === 0) return 'zéro'
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

  function toWords(num: number): string {
    if (num === 0) return ''
    if (num < 10) return units[num]
    if (num < 20) return teens[num - 10]
    if (num < 70) {
      const t = Math.floor(num / 10)
      const u = num % 10
      if (u === 0) return tens[t]
      return tens[t] + (u === 1 && t === 2 ? '-et-' : '-') + units[u]
    }
    if (num < 80) {
      const r = num - 60
      if (r === 1) return 'soixante-et-un'
      return 'soixante-' + toWords(r)
    }
    if (num < 100) {
      const u = num % 20
      if (u === 0) return 'quatre-vingt' + (num === 80 ? 's' : '')
      return 'quatre-vingt-' + toWords(u)
    }
    if (num < 1000) {
      const c = Math.floor(num / 100)
      const r = num % 100
      const cent = c === 1 ? 'cent' : units[c] + '-cent' + (r === 0 ? 's' : '')
      return cent + (r ? '-' + toWords(r) : '')
    }
    if (num < 1000000) {
      const m = Math.floor(num / 1000)
      const r = num % 1000
      const mille = m === 1 ? 'mille' : toWords(m) + '-mille'
      return mille + (r ? '-' + toWords(r) : '')
    }
    if (num < 1000000000) {
      const m = Math.floor(num / 1000000)
      const r = num % 1000000
      const millions = m === 1 ? 'un million' : toWords(m) + ' millions'
      return millions + (r ? ' ' + toWords(r) : '')
    }
    return int.toString()
  }
  return toWords(int)
}

function resolveLogoPath(logoUrl: string | undefined): string | null {
  if (!logoUrl) return null
  if (logoUrl.startsWith('/uploads/')) {
    const absPath = path.join(__dirname, '../../', logoUrl)
    if (fs.existsSync(absPath)) return absPath
  }
  return null
}

export function generatePDF(res: Response, doc_data: DocumentData, company: CompanySettings) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${doc_data.number}.pdf"`)
  doc.pipe(res)

  const primaryColor = '#2563eb'
  const textColor = '#1f2937'
  const mutedColor = '#6b7280'
  const borderColor = '#e5e7eb'
  const currency = company.currency || 'FCFA'

  // Header background
  doc.rect(0, 0, 595, 130).fill('#f8fafc')
  doc.rect(0, 0, 595, 8).fill(primaryColor)

  // Company logo
  const logoPath = resolveLogoPath(company.logo_url)
  let companyTextStartX = 50
  let companyTextStartY = 30

  if (logoPath) {
    try {
      doc.image(logoPath, 50, 20, { width: 60, height: 60, fit: [60, 60] })
      companyTextStartX = 120
    } catch {
      // logo unreadable, skip
    }
  }

  // Company info
  doc.fillColor(textColor).fontSize(14).font('Helvetica-Bold')
    .text(company.name || 'Mon Entreprise', companyTextStartX, companyTextStartY)
  companyTextStartY += 18

  doc.fontSize(8.5).font('Helvetica').fillColor(mutedColor)
  if (company.address) { doc.text(company.address, companyTextStartX, companyTextStartY); companyTextStartY += 12 }
  if (company.phone) { doc.text(`Tel : ${company.phone}`, companyTextStartX, companyTextStartY); companyTextStartY += 12 }
  if (company.email) { doc.text(`Email : ${company.email}`, companyTextStartX, companyTextStartY); companyTextStartY += 12 }
  if (company.siret) { doc.text(`SIRET : ${company.siret}`, companyTextStartX, companyTextStartY); companyTextStartY += 12 }
  if (company.vat_number) { doc.text(`TVA : ${company.vat_number}`, companyTextStartX, companyTextStartY) }

  // Document title (right)
  doc.fillColor(primaryColor).fontSize(22).font('Helvetica-Bold')
    .text(doc_data.type, 350, 28, { width: 200, align: 'right' })
  doc.fontSize(13).fillColor(textColor)
    .text(doc_data.number, 350, 54, { width: 200, align: 'right' })

  let dateY = 76
  doc.fontSize(9).fillColor(mutedColor).font('Helvetica')
  if (doc_data.issue_date) {
    const dateLabel = doc_data.type === 'FACTURE' && doc_data.issue_time
      ? `Date et heure : ${formatDateWithTime(doc_data.issue_date, doc_data.issue_time)}`
      : `Date : ${formatDate(doc_data.issue_date)}`
    doc.text(dateLabel, 350, dateY, { width: 200, align: 'right' })
    dateY += 13
  }
  if (doc_data.validity_date) {
    doc.text(`Validité : ${formatDate(doc_data.validity_date)}`, 350, dateY, { width: 200, align: 'right' })
    dateY += 13
  }
  if (doc_data.due_date) {
    doc.text(`Échéance : ${formatDate(doc_data.due_date)}`, 350, dateY, { width: 200, align: 'right' })
  }

  // Client block
  doc.rect(350, 140, 200, 85).fillAndStroke('#f0f7ff', '#dbeafe')
  doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold').text('CLIENT', 360, 148)
  doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text(doc_data.client_name, 360, 162)
  doc.fontSize(8.5).font('Helvetica').fillColor(mutedColor)
  let clientY = 176
  if (doc_data.client_company) { doc.text(doc_data.client_company, 360, clientY); clientY += 12 }
  if (doc_data.client_address) { doc.text(doc_data.client_address, 360, clientY); clientY += 12 }
  if (doc_data.client_phone) { doc.text(`Tel : ${doc_data.client_phone}`, 360, clientY); clientY += 12 }
  if (doc_data.client_email) { doc.text(`Email : ${doc_data.client_email}`, 360, clientY) }

  // Lines table
  const tableTop = 245
  const cols = { desc: 50, qty: 295, up: 345, disc: 400, vat: 440, total: 480 }

  doc.rect(50, tableTop, 495, 20).fill(primaryColor)
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
  doc.text('DESCRIPTION', cols.desc + 5, tableTop + 6)
  doc.text('QTÉ', cols.qty, tableTop + 6, { width: 45, align: 'right' })
  doc.text('P.U.', cols.up, tableTop + 6, { width: 50, align: 'right' })
  doc.text('REM%', cols.disc, tableTop + 6, { width: 35, align: 'right' })
  doc.text('TVA%', cols.vat, tableTop + 6, { width: 35, align: 'right' })
  doc.text('TOTAL HT', cols.total, tableTop + 6, { width: 65, align: 'right' })

  let y = tableTop + 22
  doc_data.lines.forEach((line, i) => {
    if (i % 2 === 1) doc.rect(50, y - 2, 495, 18).fill('#f9fafb')
    doc.fillColor(textColor).fontSize(9).font('Helvetica')
    doc.text(line.description || '-', cols.desc + 5, y, { width: 235 })
    doc.text(String(line.qty), cols.qty, y, { width: 45, align: 'right' })
    doc.text(fmtNum(line.unit_price), cols.up, y, { width: 50, align: 'right' })
    doc.text(line.discount_pct ? `${line.discount_pct}%` : '-', cols.disc, y, { width: 35, align: 'right' })
    doc.text(line.vat_rate ? `${line.vat_rate}%` : '-', cols.vat, y, { width: 35, align: 'right' })
    doc.text(fmtNum(line.total_ht), cols.total, y, { width: 65, align: 'right' })
    y += 18
  })

  // Totals block — FCFA aligned with amount
  const totalsLabelX = 370
  const totalsAmountX = 470
  const totalsAmountW = 75
  y += 12
  doc.rect(totalsLabelX, y, totalsAmountX - totalsLabelX + totalsAmountW, 1).fill(borderColor)
  y += 8

  doc.fillColor(mutedColor).fontSize(9).font('Helvetica')
  doc.text('Sous-total HT', totalsLabelX, y, { width: 95 })
  doc.text(fmtMoney(doc_data.subtotal_ht, currency), totalsAmountX, y, { width: totalsAmountW, align: 'right' })
  y += 16

  doc.text('TVA', totalsLabelX, y, { width: 95 })
  doc.text(fmtMoney(doc_data.total_tva, currency), totalsAmountX, y, { width: totalsAmountW, align: 'right' })
  y += 10
  doc.rect(totalsLabelX, y, totalsAmountX - totalsLabelX + totalsAmountW, 1).fill(borderColor)
  y += 8

  // TTC box — FCFA right-aligned with amount
  const ttcBoxX = totalsLabelX
  const ttcBoxW = totalsAmountX - totalsLabelX + totalsAmountW
  doc.rect(ttcBoxX, y, ttcBoxW, 28).fill('#eff6ff')
  doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold')
  doc.text('TOTAL TTC', ttcBoxX + 8, y + 8, { width: 90 })
  doc.text(fmtMoney(doc_data.total_ttc, currency), totalsAmountX, y + 8, { width: totalsAmountW, align: 'right' })
  y += 34

  // Payment method
  if (doc_data.payment_method) {
    doc.fillColor(mutedColor).fontSize(9).font('Helvetica')
      .text(`Mode de paiement : ${doc_data.payment_method}`, 50, y)
    y += 15
  }

  // Comment
  if (doc_data.comment) {
    y += 5
    doc.fillColor(textColor).fontSize(9).font('Helvetica-Bold').text('Notes :', 50, y)
    doc.font('Helvetica').fillColor(mutedColor).text(doc_data.comment, 50, y + 13, { width: 280 })
  }

  // Arrêté la présente facture (FACTURE uniquement)
  if (doc_data.type === 'FACTURE') {
    if (y > 722) {
      doc.addPage({ size: 'A4', margin: 50 })
      y = 50
    }
    y += 20
    const amountLetters = numberToWordsFr(doc_data.total_ttc)
    doc.fillColor(textColor).fontSize(9).font('Helvetica')
      .text(`Arrêté la présente facture à la somme de : ${amountLetters} ${currency}`, 50, y, { width: 495, align: 'center' })
    y += 25
  }

  // Footer
  const pageHeight = 842
  if (company.legal_mentions) {
    doc.rect(50, pageHeight - 80, 495, 1).fill(borderColor)
    doc.fillColor(mutedColor).fontSize(7.5).font('Helvetica')
      .text(company.legal_mentions, 50, pageHeight - 70, { width: 495, align: 'center' })
  }

  doc.end()
}
