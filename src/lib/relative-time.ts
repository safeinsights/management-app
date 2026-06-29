export function formatTimeAgo(date: Date | null, now: Date = new Date()): string | null {
    if (!date || Number.isNaN(date.getTime())) return null

    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (seconds < 0) return null
    if (seconds < 30) return 'just now'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 1) return 'less than a minute ago'
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

    const days = Math.floor(hours / 24)
    if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`

    return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}
