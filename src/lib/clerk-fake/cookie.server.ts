// E2E Clerk fake — role cookie (server-only helper).
//
// Reads the __e2e_role cookie via next/headers. Kept separate from cookie.ts so
// next/headers (which throws if bundled into client code) never leaks into the
// client shim. Used by server.ts auth()/currentUser().

import { cookies } from 'next/headers'
import { E2E_ROLE_COOKIE } from './cookie'
import { isFakeRole, type FakeRole } from './fixtures'

export async function readRoleCookieFromHeaders(): Promise<FakeRole | null> {
    const store = await cookies()
    const value = store.get(E2E_ROLE_COOKIE)?.value
    return isFakeRole(value) ? value : null
}
