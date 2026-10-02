export const JOINED_ORG_STORAGE_KEY = 'si:joined-org'

export type JoinedOrg = {
    orgName: string
    // Set only once an invited address has actually been verified onto the account, because the
    // banner copy then asserts the link (OTTER-788).
    linkedEmail?: string
}

// sessionStorage, not a URL param: the flag must survive multi-step onboarding (MFA, keys).
export function markOrgJoined(orgName: string, linkedEmail?: string) {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, JSON.stringify({ orgName, linkedEmail }))
}

// A session that started before this key held JSON still has a bare org name in it.
export function readJoinedOrg(): JoinedOrg | null {
    if (typeof window === 'undefined') return null

    const stored = sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)
    if (!stored) return null

    try {
        const parsed = JSON.parse(stored)
        return typeof parsed?.orgName === 'string' ? parsed : null
    } catch {
        return { orgName: stored }
    }
}
