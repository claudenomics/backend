const DEFAULT_ACCEPTED = ['UpToDate']

export function acceptedTcbStatuses(): Set<string> {
  const raw = process.env.TCB_ACCEPTED_STATUSES
  if (!raw) return new Set(DEFAULT_ACCEPTED)
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) return new Set(DEFAULT_ACCEPTED)
  return new Set(list)
}

export function isAcceptableTcb(status: string): boolean {
  return acceptedTcbStatuses().has(status)
}
