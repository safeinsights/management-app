'use client'

export const useEnvironmentId = () => {
    if (typeof window === 'undefined') {
        return ''
    }

    const parts = window.location.host.split('.')
    if (parts.length == 3) {
        return 'production'
    }
    if (parts.length == 4) {
        // dev uses qa for domain
        return parts[1] == 'qa' ? 'dev' : parts[1]
    }
    if (parts.length == 1) {
        return 'dev'
    }
}
