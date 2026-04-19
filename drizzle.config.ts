import type { Config } from 'drizzle-kit'

export default {
  schema: [
    './packages/store/src/schema.ts',
    './packages/db/leagues/src/schema.ts',
    './packages/db/users/src/schema.ts',
    './packages/db/squads/src/schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
} satisfies Config
