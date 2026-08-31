// Nonce-based script-src, applied in production only.
//
// The static directives (frame-ancestors/form-action/base-uri) stay in next.config.ts because they
// are request-independent; a nonce is per-request, so script-src has to be emitted from the proxy.
// The two use different header names because this policy ships report-only while the static one
// already enforces — not because sharing a name would be unsafe. Duplicate CSP headers under one
// name are enforced independently, which for disjoint directives like these changes nothing, so
// after the flip to enforcing a shared name would also be fine.
//
// Gated on NODE_ENV=production because `next dev` compiles with eval-based source maps and would
// need 'unsafe-eval'. `next start` sets NODE_ENV=production, so the e2e suite does run under this
// policy — but it builds with E2E_FAKE_CLERK, so real Clerk scripts still never load there. Clerk
// injects clerk.browser.js itself without a nonce and relies on 'strict-dynamic' to inherit trust;
// that is the one part only a deployed environment can confirm (OTTER-721).
export const CSP_NONCE_HEADER = 'x-csp-nonce'

export const isCspEnabled = () => process.env.NODE_ENV === 'production'

// Report-only for the initial rollout: violations are reported but nothing is blocked, so a policy
// that is wrong about real Clerk or Sentry cannot take down signin. Flip to the enforcing header
// name once a deployed environment reports clean.
export const CSP_HEADER = 'Content-Security-Policy-Report-Only'

export const REPORTING_ENDPOINTS_HEADER = 'Reporting-Endpoints'

// Endpoint name binding the policy's report-to directive to the Reporting-Endpoints header.
const CSP_REPORT_GROUP = 'csp-report'

export function generateNonce(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
}

// Sentry ingests CSP violation reports on its security endpoint, derived from the DSN
// (https://<key>@<host>/<project> -> https://<host>/api/<project>/security/?sentry_key=<key>).
// Returns undefined when no DSN is configured (local builds), which omits the report directives.
// Without a destination the report-only phase produces no evidence to gate the enforce flip on,
// so violations must land somewhere that is not just a browser console.
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
        // 'strict-dynamic' lets Next's nonce-carrying bootstrap scripts load the chunks they pull in
        // (including Clerk's and Sentry's), which a host allowlist cannot express reliably.
        `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
        // Sentry Session Replay compresses in a worker created from a blob URL. Some browsers
        // resolve worker-src through script-src, which 'strict-dynamic' would otherwise block.
        "worker-src 'self' blob:",
        "object-src 'none'",
    ]
    if (reportUrl) {
        // report-uri is the deprecated predecessor of report-to, kept for browsers without the
        // Reporting API; supporting browsers ignore it when report-to is present.
        directives.push(`report-uri ${reportUrl}`, `report-to ${CSP_REPORT_GROUP}`)
    }
    return directives.join('; ')
}
