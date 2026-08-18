import { Pool } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

export const platformPool = new Pool({
  connectionString: process.env.CONTROL_DB_URL,
})

platformPool.on('error', (err) => {
  console.error('Unexpected error on idle platform client', err)
})

export default platformPool
