import { readFileSync } from 'node:fs'
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
const sql = readFileSync(new URL('./add-refresh-tokens.sql', import.meta.url), 'utf8')
await client.query(sql)
const { rows } = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='refresh_tokens' ORDER BY ordinal_position",
)
console.log(`refresh_tokens: ${rows.length} columns`)
for (const r of rows) console.log(` · ${r.column_name} ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`)
const idx = await client.query(
  "SELECT indexname FROM pg_indexes WHERE tablename='refresh_tokens' ORDER BY indexname",
)
console.log(`indexes: ${idx.rows.map((r) => r.indexname).join(', ')}`)
await client.end()
