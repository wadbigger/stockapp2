import nodemailer from 'nodemailer'

function getTransporter() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendStockAlert(productName: string, currentStock: number, threshold: number) {
  const transporter = getTransporter()
  if (!transporter) return

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return

  try {
    await transporter.sendMail({
      from: `StockApp <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `⚠️ Alerte stock bas : ${productName}`,
      html: `
        <h2>Alerte de stock bas</h2>
        <p>Le produit <strong>${productName}</strong> a atteint son seuil d'alerte.</p>
        <ul>
          <li>Stock actuel : <strong>${currentStock}</strong></li>
          <li>Seuil d'alerte : <strong>${threshold}</strong></li>
        </ul>
        <p>Veuillez procéder au réapprovisionnement.</p>
      `,
    })
  } catch (err) {
    console.error('Email send error:', err)
  }
}
