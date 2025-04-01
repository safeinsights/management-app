import { db } from '@/database'
import { getOrgSlugFromActionContext, getUserIdFromActionContext } from './actions/wrappers'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    isResearcher?: boolean
}

export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkId)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                clerkId,
                isResearcher: attrs.isResearcher ?? false,
                ...attrs,
                firstName: attrs.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}

export async function ensureUserIsMemberOfOrg() {
    const userId = await getUserIdFromActionContext()
    const identifier = await getOrgSlugFromActionContext()
    const found = await db
        .selectFrom('memberUser')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', identifier).onRef('member.id', '=', 'memberUser.memberId'),
        )
        .where('memberUser.userId', '=', userId)
        .executeTakeFirst()

    if (!found) {
        db.insertInto('memberUser')
            .values(({ selectFrom }) => ({
                userId,
                isResearcher: true,
                isAdmin: false,
                isReviewer: true,
                memberId: selectFrom('member').select('id').where('identifier', '=', identifier),
            }))
            .executeTakeFirstOrThrow()
    }
    return { identifier }
}
