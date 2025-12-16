import { CLERK_ADMIN_ORG_SLUG, UserSession } from './types'

// this contains the logic to create a UserSession from Clerk metadata
// it's in lib so it can be used in both server and client contexts

import { defineAbilityFor, type AppAbility } from './permissions'

export { subject, type AppAbility } from './permissions'
type MembershipInfo = { belongsToLab: boolean; belongsToEnclave: boolean }
export type UserSessionWithAbility = UserSession & { ability: AppAbility; can: AppAbility['can'] } & MembershipInfo

export const sessionFromMetadata = ({
    metadata,
    prefs,
    clerkUserId,
}: {
    metadata: UserPublicMetadata
    prefs: UserUnsafeMetadata
    clerkUserId: string
}): UserSessionWithAbility => {
    // Flattened structure - metadata is directly UserInfo
    const info: UserInfo = metadata as UserInfo

    if (!info || !info.format) {
        throw new Error('user does not have valid metadata')
    }

    // Flattened structure - prefs is directly UserPreferences
    const userPrefs = prefs || {}

    // TODO: remove 'teams' once all users are on v3 after migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgs = info.orgs || ((info as any).teams as Record<string, UserOrgMembershipInfo>)

    const orgSlug = userPrefs.currentOrgSlug || Object.values(orgs)[0]?.slug
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
    const membershipInfo: MembershipInfo = Object.values(orgs).reduce(
        (acc: MembershipInfo, org) => {
            const mb: MembershipInfo = { ...acc }
            if (org.isAdmin || org.type === 'lab') mb.belongsToLab = true
            if (org.isAdmin || org.type === 'enclave') mb.belongsToEnclave = true
            return mb
        },
        { belongsToEnclave: session.user.isSiAdmin, belongsToLab: session.user.isSiAdmin },
    )

    const ability = defineAbilityFor(session)

    return {
        ...session,
        ...membershipInfo,
        can: ability.can.bind(ability), // directly expose the can method for devx
        ability,
    }
}
