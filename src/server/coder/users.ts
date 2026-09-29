import { coderUsersPath } from '@/lib/paths'
import { getIdeOwnerForStudy } from '../db/queries'
import { coderFetch } from './client'
import { getCoderOrganizationId } from './organizations'
import { CoderIdentity, CoderUser, CoderUserQueryResponse } from './types'
import { generateCoderUsername } from '@/server/coder/utils'

/**
 * OTTER-817: the workspace belongs to whoever claimed the IDE, not whoever submitted the proposal.
 * Keying on the submitter provisioned the workspace under their Coder account, so a teammate who
 * launched first opened a URL under someone else's namespace and Coder answered 404.
 *
 * Throws rather than falling back to the submitter. requireIdeOwner already rejects an unclaimed
 * study before any Coder call, so a fallback would be dead code whose only reachable path is a
 * future caller that skips the ownership gate — exactly the case that must not silently reproduce
 * this bug.
 */
export async function resolveCoderIdentity(studyId: string): Promise<CoderIdentity> {
    const owner = await getIdeOwnerForStudy(studyId)
    if (!owner) throw new Error(`No IDE owner for study ${studyId}; cannot resolve a Coder account`)
    if (!owner.email) throw new Error(`IDE owner ${owner.userId} of study ${studyId} has no email address`)

    return { userId: owner.userId, email: owner.email, fullName: owner.fullName }
}

async function createCoderUser(identity: CoderIdentity): Promise<CoderUser> {
    return coderFetch<CoderUser>(coderUsersPath(), {
        method: 'POST',
        body: {
            email: identity.email,
            login_type: 'oidc',
            name: identity.fullName,
            username: generateCoderUsername(identity.email),
            user_status: 'active',
            organization_ids: [await getCoderOrganizationId()],
        },
        errorMessage: 'Failed to create user',
    })
}

/**
 * `email:` is Coder's exact filter (ExactEmail -> `lower(email) = lower(...)`). A bare address is a
 * free-text search instead, which is `ILIKE '%...%'` across email, username AND display name — so
 * ann@x.edu matched joann@x.edu and we took users[0] regardless.
 *
 * The match is re-checked here rather than trusted: a Coder predating ExactEmail may parse an
 * unknown filter key as free text and silently fall back to that ILIKE, and returning the wrong
 * account is worse than returning none — it provisions one researcher's workspace under another's.
 */
export async function getCoderUserFor(identity: CoderIdentity): Promise<CoderUser | null> {
    const data = await coderFetch<CoderUserQueryResponse>(
        `${coderUsersPath()}?q=email:${encodeURIComponent(identity.email)}`,
        { errorMessage: 'Failed to query users' },
    )

    const wanted = identity.email.toLowerCase()
    return data.users?.find((user) => user.email?.toLowerCase() === wanted) ?? null
}

export async function getOrCreateCoderUserFor(identity: CoderIdentity): Promise<CoderUser> {
    return (await getCoderUserFor(identity)) ?? (await createCoderUser(identity))
}
