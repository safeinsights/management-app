export function formatRelativeTime(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null

    const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
    const seconds = Math.abs(deltaSeconds)
    if (seconds < 5) return 'just now'

    const inFuture = deltaSeconds > 0
    const phrase = (amount: string) => (inFuture ? `in ${amount}` : `${amount} ago`)

    if (seconds < 60) return phrase(`${seconds} second${seconds === 1 ? '' : 's'}`)

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return phrase(`${minutes} minute${minutes === 1 ? '' : 's'}`)

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return phrase(`${hours} hour${hours === 1 ? '' : 's'}`)

    const days = Math.floor(hours / 24)
    if (days <= 7) return phrase(`${days} day${days === 1 ? '' : 's'}`)

    return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function formatTimeAgo(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null
    if (date.getTime() > now.getTime()) return null
    return formatRelativeTime(date, now)
}
