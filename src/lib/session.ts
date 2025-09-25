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

    const userPrefs = (prefs[env] as Record<string, string>) || {}

    // TODO: remove 'teams' once all users are on v2 after 2026-02-15
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgs = info.orgs || ((info as any).teams as Record<string, UserOrgMembershipInfo>)

    const orgSlug = userPrefs['currentOrgSlug'] || Object.values(orgs)[0]?.slug
    if (!orgSlug) throw new Error(`user does not belong to any orgs`)

    const isSiAdmin = Boolean(orgs[CLERK_ADMIN_ORG_SLUG]?.isAdmin)

    const session: UserSession = {
        user: {
            ...info.user,
            clerkUserId,
            isSiAdmin,
        },
        orgs,
    }
    const ability = defineAbilityFor(session)

    return {
        ...session,
        can: ability.can.bind(ability), // directly expose the can method for devx
        ability,
    }
}
