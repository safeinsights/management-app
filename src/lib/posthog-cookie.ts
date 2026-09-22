// posthog-js's fallback domain regex. Its test-cookie probe lands on the same domain for *.safeinsights.org,
// but not on public-suffix hosts (raw CloudFront or function URLs), where this expiry is a no-op.
const PARENT_DOMAIN = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i
const IPV4 = /^\d+(\.\d+){3}$/
const METADATA_SUFFIX = '_cpm'

export function postHogCookieName(token: string) {
    return `ph_${token.replace(/\+/g, 'PL').replace(/\//g, 'SL').replace(/=/g, 'EQ')}_posthog`
}

export function parentCookieDomain(hostname: string): string | null {
    if (IPV4.test(hostname) || hostname.includes(':')) return null
    return hostname.match(PARENT_DOMAIN)?.[0] ?? null
}

export function parentDomainPostHogExpiries(token: string, hostname: string, isSecure: boolean): string[] {
    const domain = parentCookieDomain(hostname)
    if (!token || !domain) return []

    const name = postHogCookieName(token)
    const attributes = `; Max-Age=0; Path=/; Domain=.${domain}; SameSite=Lax${isSecure ? '; Secure' : ''}`
    return [name, `${name}${METADATA_SUFFIX}`].map((cookie) => `${cookie}=${attributes}`)
}

// posthog-js removes a cookie only with its current domain setting, so the copy it once wrote on the
// parent domain survives the switch to host-only and has to be expired by hand (OTTER-797).
export function expireParentDomainPostHogCookie(token: string) {
    const { hostname, protocol } = window.location
    for (const expiry of parentDomainPostHogExpiries(token, hostname, protocol === 'https:')) {
        document.cookie = expiry
    }
}
