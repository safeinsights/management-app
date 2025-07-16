import { CLERK_ADMIN_ORG_SLUG, UserSession } from './types'

// this contains the logic to create a UserSession from Clerk metadata
// it's in lib so it can be used in both server and client contexts

export const sessionFromMetadata = ({
    env,
    metadata,
    prefs,
    clerkUserId,
}: {
    env: string
    metadata: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    prefs: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    clerkUserId: string
}): UserSession => {
    const info: UserInfo = metadata[env] || null

    if (!info) {
        throw new Error(`user does not have metadata for environment ${env}`)
    }

    const teamSlug = prefs?.currentTeamSlug || Object.values(info.teams)[0]?.slug
    if (!teamSlug) throw new Error(`user does not belong to any teams`)

    const team = info.teams[teamSlug]
    if (!team) throw new Error(`user does not belong to team with slug ${teamSlug} but was set in prefs`)

    const isSiAdmin = Boolean(info.teams[CLERK_ADMIN_ORG_SLUG]?.isAdmin)

    return {
        user: {
            ...info.user,
            clerkUserId,
            isSiAdmin,
        },
        team: {
            ...team,
            isAdmin: team.isAdmin || isSiAdmin,
        },
    }
}
