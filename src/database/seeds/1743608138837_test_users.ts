import type { Kysely, Selectable } from 'kysely'
import { DB, MemberUser, User } from '@/database/types'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'

export async function seed(db: Kysely<DB>): Promise<void> {
    if (process.env.NO_TESTING_DATA) return;
    const memberId = 'openstax'
    const member = await db
        .insertInto('member')
        .values({
            identifier: memberId,
            name: 'OpenStax',
            email: 'contact@safeinsights.org',
            publicKey: 'BAD KEY, UPDATE ME',
        })
        .onConflict((oc) =>
            oc.column('identifier').doUpdateSet((eb) => ({
                identifier: eb.ref('excluded.identifier'),
                name: eb.ref('excluded.name'),
            })),
        )
        .returningAll()
        .executeTakeFirstOrThrow()

    // Test researcher
    const researcher = await findOrCreateUser({
        clerkId: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
        isResearcher: true,
        firstName: 'Researchy',
        lastName: 'McPerson',
        fullName: 'Researchy McPerson',
        email: 'researcher@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add researcher to memberUser
    await findOrCreateMemberUser({
        id: uuidv7(),
        memberId: member.id,
        userId: researcher.id,
        isAdmin: true,
        isReviewer: true,
        joinedAt: new Date(),
    })

    // Test member/reviewer
    const reviewer = await findOrCreateUser({
        clerkId: 'user_2srdGHaPWEGccVS6hzftdroHADi',
        isResearcher: false,
        firstName: 'Mr Member',
        lastName: 'McMemberson',
        fullName: 'Mr Member McMemberson',
        email: 'member@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add reviewer to memberUser
    await findOrCreateMemberUser({
        id: uuidv7(),
        memberId: member.id,
        userId: reviewer.id,
        isAdmin: true,
        isReviewer: true,
        joinedAt: new Date(),
    })
}

const findOrCreateUser = async (values: Selectable<User>) => {
    const user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', values.clerkId)
        .executeTakeFirst()

    if (!user) {
        return await db.insertInto('user').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return user
}

const findOrCreateMemberUser = async (values: Selectable<MemberUser>) => {
    const memberUser = await db
        .selectFrom('memberUser')
        .selectAll()
        .where('memberId', '=', values.memberId)
        .where('userId', '=', values.userId)
        .executeTakeFirst()

    if (!memberUser) {
        return await db.insertInto('memberUser').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return memberUser
}
