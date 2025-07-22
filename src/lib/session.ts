import { CLERK_ADMIN_ORG_SLUG, UserSession } from './types'

// this contains the logic to create a UserSession from Clerk metadata
// it's in lib so it can be used in both server and client contexts

import { defineAbilityFor, type AppAbility } from './permissions'

export { subject, type AppAbility } from './permissions'
export type UserSessionWithAbility = UserSession & { ability: AppAbility; can: AppAbility['can'] }

export const sessionFromMetadata = ({
    env,
    metadata,
    prefs,
    clerkUserId,
}: {
    env: string
    metadata: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    prefs: UserUnsafeMetadata
    clerkUserId: string
}): UserSessionWithAbility => {
    const info: UserInfo = metadata[env] || null

    if (!info) {
        throw new Error(`user does not have metadata for environment ${env}`)
    }

    const userPrefs = prefs[env] as Record<string, string>
    const teamSlug = userPrefs['currentTeamSlug'] || Object.values(info.teams)[0]?.slug
    if (!teamSlug) throw new Error(`user does not belong to any teams`)

    const team = info.teams[teamSlug]
    if (!team)
        throw new Error(
            `in env ${env}, clerk user ${clerkUserId} does not belong to team with slug ${teamSlug} but was set in prefs: ${JSON.stringify(prefs, null, 2)}`,
        )

    const isSiAdmin = Boolean(info.teams[CLERK_ADMIN_ORG_SLUG]?.isAdmin)

    const session: UserSession = {
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
    const ability = defineAbilityFor(session)

    return {
        ...session,
        can: ability.can.bind(ability), // directly expose the can method for devx
        ability,
    }
}
