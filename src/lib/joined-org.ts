export const JOINED_ORG_STORAGE_KEY = 'si:joined-org'

// sessionStorage, not a URL param: the flag must survive multi-step onboarding (MFA, keys).
export function markOrgJoined(orgName: string) {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, orgName)
}
