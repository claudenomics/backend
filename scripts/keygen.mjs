import { generateKeyPair, exportPKCS8 } from 'jose'

if (process.stdout.isTTY && !process.env.KEYGEN_ALLOW_TTY) {
  process.stderr.write(
    'keygen: refusing to print private key to a terminal. Redirect to a file, e.g.\n' +
    '  pnpm keygen >> .env\n' +
    '(override with KEYGEN_ALLOW_TTY=1 if you really mean it).\n',
  )
  process.exit(1)
}

const { privateKey } = await generateKeyPair('ES256', { extractable: true })
const privatePem = await exportPKCS8(privateKey)
const privateB64 = Buffer.from(privatePem).toString('base64')
const kid = `key-${new Date().toISOString().slice(0, 7)}`

process.stdout.write(`JWT_KID=${kid}\nJWT_PRIVATE_KEY=${privateB64}\n`)
