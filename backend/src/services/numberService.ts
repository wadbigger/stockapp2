import { PoolClient } from 'pg'

export async function generateNumber(client: PoolClient, prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  await client.query(
    `INSERT INTO invoice_sequences (year, prefix, last_number)
     VALUES ($1, $2, 0)
     ON CONFLICT (year, prefix) DO NOTHING`,
    [year, prefix]
  )
  const res = await client.query(
    `UPDATE invoice_sequences
     SET last_number = last_number + 1
     WHERE year = $1 AND prefix = $2
     RETURNING last_number`,
    [year, prefix]
  )
  const num = res.rows[0].last_number
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`
}
