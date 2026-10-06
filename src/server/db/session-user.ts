import { db } from '@/database'

// No Next.js dependencies, so bin scripts can use it too.

type OrgRow = Omit<UserOrgMembershipInfo, 'isAdmin'> & { isAdmin: boolean | null }

export const orgsBySlug = (rows: OrgRow[]): UserInfo['orgs'] =>
    Object.fromEntries(rows.map((org) => [org.slug, { ...org, isAdmin: org.isAdmin || false }]))

// The token's user.id is only a claim: both ids must match, or a stale value could name another
// person's row. Null means no such user. One round trip covers the check and the org list.
export async function sessionUserOrgs(userId: string, clerkUserId: string): Promise<UserInfo['orgs'] | null> {
    const rows = await db
        .selectFrom('user')
        .leftJoin('orgUser', 'orgUser.userId', 'user.id')
        .leftJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.id', 'org.slug', 'org.type', 'orgUser.isAdmin'])
        .where('user.id', '=', userId)
        .where('user.clerkId', '=', clerkUserId)
        .execute()
    if (rows.length === 0) return null

    return orgsBySlug(
        rows.flatMap(({ id, slug, type, isAdmin }) => (id && slug && type ? [{ id, slug, type, isAdmin }] : [])),
    )
}

export async function sessionUserExists(userId: string, clerkUserId: string): Promise<boolean> {
    const row = await db
        .selectFrom('user')
        .select('id')
        .where('id', '=', userId)
        .where('clerkId', '=', clerkUserId)
        .executeTakeFirst()
    return Boolean(row)
}
