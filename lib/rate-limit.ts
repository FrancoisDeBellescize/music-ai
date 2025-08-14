const WINDOW_MS = 10_000
const MAX_REQ = 1

type Entry = { count: number; resetAt: number }
const ipToEntry = new Map<string, Entry>()

export function rateLimitOk(ip: string | null | undefined) {
  const key = ip || 'unknown'
  const now = Date.now()
  const prev = ipToEntry.get(key)
  if (!prev || prev.resetAt < now) {
    ipToEntry.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (prev.count < MAX_REQ) {
    prev.count += 1
    return true
  }
  return false
}


