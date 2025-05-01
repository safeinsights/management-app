import type { Kysely, Selectable } from 'kysely'
import type { DB, OrgUser, User } from '@/database/types'

export async function seed(db: Kysely<DB>): Promise<void> {
    // DO NOT RUN THIS IN PRODUCTION where NO_TESTING_DATA is set
    if (process.env.NO_TESTING_DATA) return

    // dynamic require to keep build smaller and not import if NO_TESTING_DATA
    const { v7: uuidv7 } = await import('uuid')

    const org = await db
        .insertInto('org')
        .values({
            slug: 'openstax',
            name: 'OpenStax',
            email: 'contact@safeinsights.org',
            publicKey: 'BAD KEY, UPDATE ME',
        })
        .onConflict((oc) =>
            oc.column('slug').doUpdateSet((eb) => ({
                slug: eb.ref('excluded.slug'),
                name: eb.ref('excluded.name'),
            })),
        )
        .returningAll()
        .executeTakeFirstOrThrow()

    // Test researcher
    const researcher = await findOrCreateUser(db, {
        clerkId: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
        firstName: 'Researchy',
        lastName: 'McPerson',
        email: 'researcher@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add researcher to orgUser
    await findOrCreateOrgUser(db, {
        id: uuidv7(),
        orgId: org.id,
        userId: researcher.id,
        isAdmin: true,
        isReviewer: true,
        isResearcher: true,
        joinedAt: new Date(),
    })

    // Test org/reviewer
    const reviewer = await findOrCreateUser(db, {
        clerkId: 'user_2srdGHaPWEGccVS6hzftdroHADi',
        firstName: 'Mr Org',
        lastName: 'McOrgson',
        email: 'org@me.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: uuidv7(),
    })

    // Add reviewer to orgUser
    await findOrCreateOrgUser(db, {
        id: uuidv7(),
        isResearcher: true,
        orgId: org.id,
        userId: reviewer.id,
        isAdmin: true,
        isReviewer: true,
        joinedAt: new Date(),
    })
}

const findOrCreateUser = async (db: Kysely<DB>, values: Omit<Selectable<User>, 'fullName'>) => {
    const user = await db.selectFrom('user').select(['id']).where('clerkId', '=', values.clerkId).executeTakeFirst()

    if (!user) {
        return await db.insertInto('user').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return user
}

const findOrCreateOrgUser = async (db: Kysely<DB>, values: Selectable<OrgUser>) => {
    const orgUser = await db
        .selectFrom('orgUser')
        .selectAll()
        .where('orgId', '=', values.orgId)
        .where('userId', '=', values.userId)
        .executeTakeFirst()

    if (!orgUser) {
        return await db.insertInto('orgUser').values(values).returningAll().executeTakeFirstOrThrow()
    }

    return orgUser
}
