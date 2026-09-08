// Separate from cookie.ts so next/headers, which throws if bundled into client code, never
// leaks into the client shim.

import { cookies } from 'next/headers'
import { E2E_ROLE_COOKIE } from './cookie'
import { isFakeRole, type FakeRole } from './fixtures'

export async function readRoleCookieFromHeaders(): Promise<FakeRole | null> {
    const store = await cookies()
    const value = store.get(E2E_ROLE_COOKIE)?.value
    return isFakeRole(value) ? value : null
}
