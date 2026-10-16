import { selectUserOrgRows } from '../session-user'
import { sql } from 'kysely'
import { type DBExecutor } from '@/database'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { AccessDeniedError } from '@/lib/errors'
import { currentDb, wasCalledFromAPI } from '@/server/request-context'
import { findOrCreateSiUserId } from '../mutations'

export type SiUser = ClerkUser & {
    id: string
}

export async function siUser(throwIfNotFound?: true): Promise<SiUser>
export async function siUser(throwIfNotFound?: false): Promise<SiUser | null>
export async function siUser(throwIfNotFound = true): Promise<SiUser | null> {
    const clerkUser = wasCalledFromAPI() ? null : await currentClerkUser()
    if (!clerkUser || clerkUser.banned) {
        if (throwIfNotFound) throw new AccessDeniedError({ user: 'was not found' })
        return null
    }

    const userId = await findOrCreateSiUserId(clerkUser.id, {
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        email: clerkUser.primaryEmailAddress?.emailAddress,
    })
    return {
        ...clerkUser,
        id: userId,
    } as SiUser
}

export const getUserPublicKey = async (userId: string) => {
    // user_public_key has a unique constraint on user_id, so there is at most one row per user.
    const result = await currentDb()
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint', 'userPublicKey.publicKey', 'userPublicKey.updatedAt'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result
}

// The name a peer's tab shows for whoever closed a round. Only the server can supply it, and four
// actions were asking for it the same way.
export const fetchUserFullName = async (userId: string, db: DBExecutor) => {
    const user = await db.selectFrom('user').select('fullName').where('id', '=', userId).executeTakeFirstOrThrow()
    return user.fullName
}

export const getOrgInfoForUserId = async (userId: string) => {
    const rows = await selectUserOrgRows(userId, currentDb()).execute()
    return rows.flatMap(({ id, slug, type, isAdmin }) => (id && slug && type ? [{ id, slug, type, isAdmin }] : []))
}

// Both actions that grant the membership do it in the claim's transaction, so joinedAt is the claim time.
// The membership join also drops an org the account has since left.
export const getLatestClaimedInviteOrg = async (userId: string) =>
    await currentDb()
        .selectFrom('pendingUser')
        .innerJoin('org', 'org.id', 'pendingUser.orgId')
        .innerJoin('orgUser', (join) =>
            join.onRef('orgUser.orgId', '=', 'pendingUser.orgId').on('orgUser.userId', '=', userId),
        )
        .select('org.slug')
        .where('pendingUser.claimedByUserId', '=', userId)
        .orderBy('orgUser.joinedAt', 'desc')
        .orderBy('orgUser.id', 'desc')
        .limit(1)
        .executeTakeFirst()

export async function hasViewedSubmitCodeFaq(userId: string): Promise<boolean> {
    const row = await currentDb()
        .selectFrom('audit')
        // recordId rather than userId: the same value here, but recordId is the event's subject and
        // it is the indexed column.
        .select('audit.id')
        .where('audit.recordType', '=', 'USER')
        .where('audit.eventType', '=', 'VIEWED')
        .where('audit.recordId', '=', userId)
        .where(sql<string>`audit.metadata->>'subject'`, '=', SUBMIT_CODE_FAQ_SUBJECT)
        .limit(1)
        .executeTakeFirst()

    return row !== undefined
}
