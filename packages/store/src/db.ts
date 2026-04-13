import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const POOL_MAX = Number.parseInt(process.env.PG_POOL_MAX ?? '5', 10)

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 5,
  ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: true },
})

export const db = drizzle(pool, { schema })
export type DB = typeof db
