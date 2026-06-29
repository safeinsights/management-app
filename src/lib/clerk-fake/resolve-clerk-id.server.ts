// E2E Clerk fake — resolve the real DB clerk_id for a seeded user (server-only).
//
// The test DB may carry clerk_id values from a prior (stub/real-Clerk) seed rather
// than the deterministic test-clerk-<role>. The fake's currentUser().id must equal the
// DB row's clerk_id so findOrCreateSiUserId (which looks up by clerkId) finds the
// seeded user instead of inserting a duplicate. We read it once per process by the
// fixed user.id and cache it. This is the ONLY DB read the fake adds, and it does not
// touch any Clerk network.

import { db } from '@/database'
import type { FakeFixture } from './fixtures'

const cache = new Map<string, string>()

export async function resolveClerkId(fixture: FakeFixture): Promise<string> {
    const cached = cache.get(fixture.userId)
    if (cached) return cached

    const row = await db.selectFrom('user').select('clerkId').where('id', '=', fixture.userId).executeTakeFirst()

    // Fall back to the fixture's deterministic id if the row is absent (e.g. a fresh
    // seed that used test-clerk-<role>); marshalSession's short-circuit keys off
    // user.id (the UUID) regardless, so this only affects currentUser identity.
    const clerkId = row?.clerkId ?? fixture.clerkId
    cache.set(fixture.userId, clerkId)
    return clerkId
}
