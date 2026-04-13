import pino from 'pino'

const SCRUB_KEYS = [
  'code_verifier',
  'codeVerifier',
  'token',
  'jwt',
  'privyAccessToken',
  'privy_access_token',
  'authorization',
  'cookie',
  'JWT_PRIVATE_KEY',
  'PRIVY_APP_SECRET',
]

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: label => ({ level: label }),
  },
  redact: {
    paths: SCRUB_KEYS.flatMap(k => [k, `*.${k}`, `*.*.${k}`]),
    censor: '[redacted]',
  },
})

export function reqLogger(reqId: string) {
  return log.child({ reqId })
}
