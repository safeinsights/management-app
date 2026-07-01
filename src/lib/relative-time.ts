// Human-friendly relative time that works for both past ("5 minutes ago") and future ("in 5
// minutes") instants. Returns null only for a missing or invalid date.
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null

    const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
    const seconds = Math.abs(deltaSeconds)
    if (seconds < 30) return 'just now'

    const inFuture = deltaSeconds > 0
    const phrase = (amount: string) => (inFuture ? `in ${amount}` : `${amount} ago`)

    const minutes = Math.floor(seconds / 60)
    if (minutes < 1) return inFuture ? 'in less than a minute' : 'less than a minute ago'
    if (minutes < 60) return phrase(`${minutes} minute${minutes === 1 ? '' : 's'}`)

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return phrase(`${hours} hour${hours === 1 ? '' : 's'}`)

    const days = Math.floor(hours / 24)
    if (days <= 7) return phrase(`${days} day${days === 1 ? '' : 's'}`)

    return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

// Past-only relative time: null for future instants (where "ago" phrasing is assumed).
export function formatTimeAgo(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null
    if (date.getTime() > now.getTime()) return null
    return formatRelativeTime(date, now)
}
