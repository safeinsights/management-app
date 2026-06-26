// E2E Clerk fake — role cookie (browser-safe helpers).
//
// A single host-only cookie carries which seeded role the test is running as.
// It is read by both the client shim (document.cookie) and the server shim
// (next/headers cookies(), via cookie.server.ts). Keep this module free of any
// server-only imports (no next/headers) so it can be bundled into client code.

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
