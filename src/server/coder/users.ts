import { coderUsersPath } from '@/lib/paths'
import logger from '@/lib/logger'
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
 * The address goes in bare. Newer Coder has an exact `email:` filter, but the deployed instance
 * rejects the key outright — `400 Invalid user search query, "email" is not a valid query param` —
 * which took out every IDE launch on QA (OTTER-817). Bare text is accepted by every version.
 *
 * That makes the match below load-bearing rather than defensive: a free-text query is
 * `ILIKE '%...%'` across email, username AND display name, so it also returns longer addresses that
 * merely contain this one. Returning the wrong account is worse than returning none — it would
 * provision one researcher's workspace under another's.
 */
export async function getCoderUserFor(identity: CoderIdentity): Promise<CoderUser | null> {
    const data = await coderFetch<CoderUserQueryResponse>(
        `${coderUsersPath()}?q=${encodeURIComponent(identity.email)}`,
        { errorMessage: 'Failed to query users' },
    )

    const wanted = identity.email.toLowerCase()
    const match = data.users?.find((user) => user.email?.toLowerCase() === wanted) ?? null

    // Rows came back but none matched: either they are all fuzzy hits on a longer address, or this
    // Coder omits email from the list response and dropped a user that exists. The second ends as a
    // duplicate-email rejection from the create below, so name the cause while we still have it.
    if (!match && data.users?.length) {
        logger.warn(`Coder returned ${data.users.length} user(s) for ${wanted}, none an exact email match`)
    }

    return match
}

export async function getOrCreateCoderUserFor(identity: CoderIdentity): Promise<CoderUser> {
    return (await getCoderUserFor(identity)) ?? (await createCoderUser(identity))
}
