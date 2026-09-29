// Keep free of server-only imports (no next/headers) so it can be bundled into client code.

import { isFakeRole, type FakeRole } from './fixtures'

export const E2E_ROLE_COOKIE = '__e2e_role'

export function parseRoleCookie(cookieHeader: string | undefined | null): FakeRole | null {
    if (!cookieHeader) return null
    for (const part of cookieHeader.split(';')) {
        const [rawName, ...rest] = part.trim().split('=')
        if (rawName === E2E_ROLE_COOKIE) {
            const value = decodeURIComponent(rest.join('='))
            return isFakeRole(value) ? value : null
        }
    }
    return null
}

export function readRoleCookieFromDocument(): FakeRole | null {
    if (typeof document === 'undefined') return null
    return parseRoleCookie(document.cookie)
}

export function writeRoleCookieToDocument(role: FakeRole): void {
    if (typeof document === 'undefined') return
    document.cookie = `${E2E_ROLE_COOKIE}=${role}; Path=/; SameSite=Lax`
}

export function clearRoleCookieFromDocument(): void {
    if (typeof document === 'undefined') return
    document.cookie = `${E2E_ROLE_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`
}
