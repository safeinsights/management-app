// No Next.js dependencies so this can be used in scripts and tests.

import { isDeepEqual, omit } from 'remeda'

// "dbfyq3" marks the seeded production-like accounts, which must never be deleted.
export const TEST_USER_PATTERN = /^(?!.*dbfyq3).*(?:test|delete).*$/i

export function getProtectedTestEmails(): Set<string> {
    return new Set(
        [process.env.CLERK_RESEARCHER_EMAIL, process.env.CLERK_REVIEWER_EMAIL, process.env.CLERK_ADMIN_EMAIL]
            .filter(Boolean)
            .map((e) => e!.toLowerCase()),
    )
}

export function isTestUser(
    user: {
        emailAddresses: Array<{ emailAddress: string }>
        firstName?: string | null
        lastName?: string | null
    },
    protectedEmails?: Set<string>,
): boolean {
    const protected_ = protectedEmails ?? getProtectedTestEmails()

    const isProtected = user.emailAddresses.some((e) => protected_.has(e.emailAddress.toLowerCase()))
    if (isProtected) return false

    const emailMatches = user.emailAddresses.some((e) => TEST_USER_PATTERN.test(e.emailAddress))
    const nameMatches = TEST_USER_PATTERN.test(user.firstName || '') || TEST_USER_PATTERN.test(user.lastName || '')

    return emailMatches || nameMatches
}

// Orgs stay out of publicMetadata because the session token copies it, and each org made every
// request ~320 bytes larger (OTTER-752). The server and the client read orgs from the database.
export function publicMetadata(info: Pick<UserInfo, 'user'>): ClerkPublicMetadata {
    return { format: 'v3', user: { id: info.user.id }, teams: null }
}

export function fullUserInfo(userId: string, orgs: UserInfo['orgs']): UserInfo & UserPublicMetadata {
    return { format: 'v3', user: { id: userId }, teams: null, orgs }
}

// One user's change in bin/slim-clerk-public-metadata.ts. `legacy` marks a user with no user.id.
export type MetadataPlan =
    | { action: 'keep' }
    | { action: 'skip'; reason: string }
    | { action: 'write'; metadata: UserPublicMetadata; legacy?: true }

// Formats before v3 kept the orgs under `teams`.
const hasOrgList = (metadata: UserPublicMetadata) => 'orgs' in metadata || metadata.teams != null

export function slimMetadataPlan(metadata: UserPublicMetadata): MetadataPlan {
    if (!hasOrgList(metadata)) return { action: 'keep' }
    const userId = metadata.user?.id
    if (userId) return { action: 'write', metadata: publicMetadata({ user: { id: userId } }) }

    // Without a user.id these are the largest metadata of all, and a cookie over the size limit gets
    // a 413 before marshalSession() can repair it. The format stays as it is, so the repair still runs.
    return { action: 'write', metadata: omit(metadata, ['orgs', 'teams']) as UserPublicMetadata, legacy: true }
}

// For a rollback: code from before OTTER-752 reads the orgs only from the token.
export function restoreMetadataPlan(metadata: UserPublicMetadata, orgs: UserInfo['orgs'] | null): MetadataPlan {
    const userId = metadata.user?.id
    if (!userId) return { action: 'skip', reason: 'publicMetadata has no user.id' }
    if (!orgs) return { action: 'skip', reason: `no user ${userId} with this Clerk id in the database` }

    const full = fullUserInfo(userId, orgs)
    return isDeepEqual(metadata, full) ? { action: 'keep' } : { action: 'write', metadata: full }
}
