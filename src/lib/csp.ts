// Nonce-based script-src, applied in production only.
//
// The static directives (frame-ancestors/form-action/base-uri) stay in next.config.ts because they
// are request-independent. A nonce is per-request, so it has to be emitted from the proxy — and the
// two must never emit the same header name, since browsers intersect duplicate CSP headers and the
// combined policy fails closed.
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

export function generateNonce(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
}

// Read the per-request nonce set by the proxy. Returns undefined when the CSP is off (dev, e2e),
// which is what ClerkProvider expects for "no nonce".
export async function getCspNonce(): Promise<string | undefined> {
    if (!isCspEnabled()) return undefined
    const { headers } = await import('next/headers')
    return (await headers()).get(CSP_NONCE_HEADER) ?? undefined
}

export function cspHeaderValue(nonce: string): string {
    return [
        // 'strict-dynamic' lets Next's nonce-carrying bootstrap scripts load the chunks they pull in
        // (including Clerk's and Sentry's), which a host allowlist cannot express reliably.
        `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
        // Sentry Session Replay compresses in a worker created from a blob URL. Some browsers
        // resolve worker-src through script-src, which 'strict-dynamic' would otherwise block.
        "worker-src 'self' blob:",
        "object-src 'none'",
    ].join('; ')
}
