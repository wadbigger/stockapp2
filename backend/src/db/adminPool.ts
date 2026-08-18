import { Client } from 'pg'

function isValidDbName(name: string): boolean {
  return /^[a-z][a-z0-9_]{2,62}$/.test(name)
}

export async function createDatabase(dbName: string): Promise<void> {
  if (!isValidDbName(dbName)) throw new Error(`Nom de base invalide: ${dbName}`)
  const client = new Client({ connectionString: process.env.PG_ADMIN_URL })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${dbName}"`)
  } finally {
    await client.end()
  }
}

export async function terminateConnections(dbName: string): Promise<void> {
  if (!isValidDbName(dbName)) throw new Error(`Nom de base invalide: ${dbName}`)
  const client = new Client({ connectionString: process.env.PG_ADMIN_URL })
  await client.connect()
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
  } finally {
    await client.end()
  }
}

export async function dropDatabase(dbName: string): Promise<void> {
  if (!isValidDbName(dbName)) throw new Error(`Nom de base invalide: ${dbName}`)
  await terminateConnections(dbName)
  const client = new Client({ connectionString: process.env.PG_ADMIN_URL })
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`)
  } finally {
    await client.end()
  }
}

export async function databaseExists(dbName: string): Promise<boolean> {
  const client = new Client({ connectionString: process.env.PG_ADMIN_URL })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    return rows.length > 0
  } finally {
    await client.end()
  }
}
