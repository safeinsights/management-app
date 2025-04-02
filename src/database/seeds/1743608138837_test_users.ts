import type { Kysely } from 'kysely'
import { DB } from '@/database/types'

export async function seed(db: Kysely<DB>): Promise<void> {
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
    const researcher = await db
        .insertInto('user')
        .values({
            clerkId: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
            isResearcher: true,
            firstName: 'Researchy',
            lastName: 'McPerson',
            email: 'researcher@me.com',
        })
        .returningAll()
        .onConflict((oc) =>
            oc.column('clerkId').doUpdateSet((eb) => ({
                clerkId: eb.ref('excluded.clerkId'),
            })),
        )
        .executeTakeFirstOrThrow()

    // Add researcher to memberUser
    await db
        .insertInto('memberUser')
        .values({
            memberId: member.id,
            userId: researcher.id,
            isAdmin: false,
            isReviewer: false,
        })
        .execute()

    // Test member/reviewer
    const reviewer = await db
        .insertInto('user')
        .values({
            clerkId: 'user_2srdGHaPWEGccVS6hzftdroHADi',
            isResearcher: false,
            firstName: 'Mr Member',
            lastName: 'McMemberson',
            email: 'member@me.com',
        })
        .returningAll()
        .onConflict((oc) =>
            oc.column('clerkId').doUpdateSet((eb) => ({
                clerkId: eb.ref('excluded.clerkId'),
            })),
        )
        .executeTakeFirstOrThrow()

    // Add member to memberUser
    await db
        .insertInto('memberUser')
        .values({
            memberId: member.id,
            userId: reviewer.id,
            isAdmin: true,
            isReviewer: true,
        })
        .execute()
}
