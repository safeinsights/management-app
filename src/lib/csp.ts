// Emitted from the proxy because a nonce is per-request. Production only, as `next dev` needs
// 'unsafe-eval' (OTTER-721).
export const CSP_NONCE_HEADER = 'x-csp-nonce'

export const isCspEnabled = () => process.env.NODE_ENV === 'production'

export const CSP_HEADER = 'Content-Security-Policy'

export const REPORTING_ENDPOINTS_HEADER = 'Reporting-Endpoints'

const CSP_REPORT_GROUP = 'csp-report'

// Also sent from next.config.ts, for responses the proxy skips. Where both set the header, Next keeps
// only the proxy's, so the nonce policy must repeat these (SIINFOSEC-1460/1461, ZAP-10055).
export const STATIC_CSP_DIRECTIVES = [
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
]

export function generateNonce(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
}

export function cspReportUrl(
    dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
): string | undefined {
    if (!dsn) return undefined
    try {
        const { username, host, pathname } = new URL(dsn)
        const projectId = pathname.replaceAll('/', '')
        if (!username || !projectId) return undefined
        return `https://${host}/api/${projectId}/security/?sentry_key=${username}`
    } catch {
        return undefined
    }
}

export function reportingEndpointsValue(reportUrl: string): string {
    return `${CSP_REPORT_GROUP}="${reportUrl}"`
}

export function cspHeaderValue(nonce: string, reportUrl?: string): string {
    const directives = [
        // 'strict-dynamic' lets Next's bootstrap scripts load the chunks they pull in, which a
        // host allowlist cannot express reliably.
        `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
        // Sentry Session Replay compresses in a blob-URL worker, which some browsers resolve
        // through script-src.
        "worker-src 'self' blob:",
        ...STATIC_CSP_DIRECTIVES,
    ]
    if (reportUrl) {
        // report-uri is kept for browsers without the Reporting API.
        directives.push(`report-uri ${reportUrl}`, `report-to ${CSP_REPORT_GROUP}`)
    }
    return directives.join('; ')
}
