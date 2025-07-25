'use client'

export const useEnvironmentId = () => {
    if (typeof window === 'undefined') {
        return ''
    }

    const hostMatch = window.location.host.match(/app\.([^.]+)/)
    if (!hostMatch || hostMatch.length < 2) {
        return 'local'
    }
    if (hostMatch[1] === 'safeinsights') {
        return 'production'
    }
    if (hostMatch[1] === 'qa') {
        return 'dev'
    }

    return hostMatch[1]
}
