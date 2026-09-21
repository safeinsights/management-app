import { plural } from '@/lib/string'

export function formatRelativeTime(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null

    const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
    const seconds = Math.abs(deltaSeconds)
    if (seconds < 5) return 'just now'

    const inFuture = deltaSeconds > 0
    const phrase = (amount: string) => (inFuture ? `in ${amount}` : `${amount} ago`)

    if (seconds < 60) return phrase(plural(seconds, 'second'))

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return phrase(plural(minutes, 'minute'))

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return phrase(plural(hours, 'hour'))

    const days = Math.floor(hours / 24)
    if (days <= 7) return phrase(plural(days, 'day'))

    return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function formatTimeAgo(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null
    if (date.getTime() > now.getTime()) return null
    return formatRelativeTime(date, now)
}
