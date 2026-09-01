// The test DB may carry clerk_id values from a prior seed, and currentUser().id must equal the
// row's clerk_id so findOrCreateSiUserId finds the seeded user rather than inserting a duplicate.

import { db } from '@/database'
import type { FakeFixture } from './fixtures'

const cache = new Map<string, string>()

export async function resolveClerkId(fixture: FakeFixture): Promise<string> {
    const cached = cache.get(fixture.userId)
    if (cached) return cached

    const row = await db.selectFrom('user').select('clerkId').where('id', '=', fixture.userId).executeTakeFirst()

    const clerkId = row?.clerkId ?? fixture.clerkId
    cache.set(fixture.userId, clerkId)
    return clerkId
}
