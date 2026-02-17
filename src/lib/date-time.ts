type RelativeUnit = Intl.RelativeTimeFormatUnit

const STEPS: Array<{ maxAbsSeconds: number; unit: RelativeUnit; divisor: number }> = [
  { maxAbsSeconds: 60, unit: 'second', divisor: 1 },
  { maxAbsSeconds: 60 * 60, unit: 'minute', divisor: 60 },
  { maxAbsSeconds: 60 * 60 * 24, unit: 'hour', divisor: 60 * 60 },
  { maxAbsSeconds: 60 * 60 * 24 * 7, unit: 'day', divisor: 60 * 60 * 24 },
  { maxAbsSeconds: 60 * 60 * 24 * 30, unit: 'week', divisor: 60 * 60 * 24 * 7 },
  { maxAbsSeconds: 60 * 60 * 24 * 365, unit: 'month', divisor: 60 * 60 * 24 * 30 },
]

export function formatRelativeTime(dateValue: string | null | undefined, locale: string, nowMs = Date.now()): string | null {
  if (!dateValue) return null
  const parsedMs = Date.parse(dateValue)
  if (!Number.isFinite(parsedMs)) return null

  const diffSeconds = Math.round((parsedMs - nowMs) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  const step = STEPS.find((candidate) => absSeconds < candidate.maxAbsSeconds)
  const unit: RelativeUnit = step?.unit || 'year'
  const divisor = step?.divisor || 60 * 60 * 24 * 365
  const value = Math.round(diffSeconds / divisor)

  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
}

export function formatExactDateTime(dateValue: string | null | undefined, locale: string): string | null {
  if (!dateValue) return null
  const parsedMs = Date.parse(dateValue)
  if (!Number.isFinite(parsedMs)) return null
  return new Date(parsedMs).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

