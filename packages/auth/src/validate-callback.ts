const DEFAULT_HOSTS = new Set(['127.0.0.1', '[::1]'])

function allowedHosts(): Set<string> {
  const raw = process.env.ALLOWED_CALLBACK_HOSTS
  if (!raw) return DEFAULT_HOSTS
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
}

export function isValidCallback(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol !== 'http:') return false
  if (url.username !== '' || url.password !== '') return false
  if (url.hash !== '') return false
  if (url.search !== '') return false
  if (url.pathname !== '/callback') return false
  if (!allowedHosts().has(url.hostname)) return false

  if (url.port === '') return false
  const port = Number(url.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return false

  return true
}
