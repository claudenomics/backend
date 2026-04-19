import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const WALLET = '4YywuUXhhvnP42pWFAVCop4UTY7sKWgZuY3J9mHHXrpt'
const USER_HANDLE = 'zeroxpunk'
const USER_DISPLAY = '0xPunk'
const USER_AVATAR = 'https://claudenomics.xyz/0xpunk.png'
const SQUAD_SLUG = 'claudenomics'
const SQUAD_X_HANDLE = 'claudenomics'
const SQUAD_AVATAR = 'https://unavatar.io/x/claudenomics'

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query('BEGIN')

  const { rows: userRows } = await client.query(
    'SELECT id FROM users WHERE wallet = $1 LIMIT 1',
    [WALLET],
  )
  if (userRows.length === 0) throw new Error(`user not found for wallet ${WALLET}`)
  const userId = userRows[0].id

  await client.query(
    'UPDATE users SET handle = $1, display_name = $2, avatar_url = $3, updated_at = now() WHERE id = $4',
    [USER_HANDLE, USER_DISPLAY, USER_AVATAR, userId],
  )

  await client.query(
    `INSERT INTO social_accounts (user_id, provider, provider_user_id, handle)
     VALUES ($1, 'x', $2, $2)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_user_id = EXCLUDED.provider_user_id,
       handle = EXCLUDED.handle,
       connected_at = now()`,
    [userId, USER_HANDLE],
  )

  const { rows: squadRows } = await client.query(
    'SELECT id FROM squads WHERE slug = $1 LIMIT 1',
    [SQUAD_SLUG],
  )
  if (squadRows.length === 0) throw new Error(`squad not found for slug ${SQUAD_SLUG}`)
  const squadId = squadRows[0].id

  await client.query(
    `INSERT INTO squad_socials (squad_id, provider, provider_user_id, handle, display_name, avatar_url)
     VALUES ($1, 'x', $2, $2, $3, $4)
     ON CONFLICT (squad_id, provider) DO UPDATE SET
       provider_user_id = EXCLUDED.provider_user_id,
       handle = EXCLUDED.handle,
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       connected_at = now()`,
    [squadId, SQUAD_X_HANDLE, 'Claudenomics', SQUAD_AVATAR],
  )

  await client.query('COMMIT')
  console.log('ok', { userId, squadId })
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  await client.end()
}
