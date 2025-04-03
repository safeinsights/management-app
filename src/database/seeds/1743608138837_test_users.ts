import type { Kysely, Selectable } from 'kysely'
import type { DB, MemberUser, User } from '@/database/types'

export async function seed(db: Kysely<DB>): Promise<void> {
    // DO NOT RUN THIS IN PRODUCTION where NO_TESTING_DATA is set
    if (process.env.NO_TESTING_DATA) return

    // dynamic require to keep build smaller and not import if NO_TESTING_DATA
    const { v7: uuidv7 } = await import('uuid')

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
    const researcher = await findOrCreateUser(db, {
        clerkId: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
        isResearcher: true,
        firstName: 'Researchy',
        lastName: 'McPerson',
        email: 'researcher@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add researcher to memberUser
    await findOrCreateMemberUser(db, {
        id: uuidv7(),
        memberId: member.id,
        userId: researcher.id,
        isAdmin: true,
        isReviewer: true,
        joinedAt: new Date(),
    })

    // Test member/reviewer
    const reviewer = await findOrCreateUser(db, {
        clerkId: 'user_2srdGHaPWEGccVS6hzftdroHADi',
        isResearcher: false,
        firstName: 'Mr Member',
        lastName: 'McMemberson',
        email: 'member@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add reviewer to memberUser
    await findOrCreateMemberUser(db, {
        id: uuidv7(),
        memberId: member.id,
        userId: reviewer.id,
        isAdmin: true,
        isReviewer: true,
        joinedAt: new Date(),
    })
}

const findOrCreateUser = async (db: Kysely<DB>, values: Omit<Selectable<User>, 'fullName'>) => {
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

const findOrCreateMemberUser = async (db: Kysely<DB>, values: Selectable<MemberUser>) => {
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
