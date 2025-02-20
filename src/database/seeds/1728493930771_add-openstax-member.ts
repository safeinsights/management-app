import type { Kysely } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seed(db: Kysely<any>): Promise<void> {
    await db
        .insertInto('member')
        .values({
            identifier: 'openstax',
            name: 'OpenStax',
            email: 'contact@safeinsights.org',
            public_key: 'BAD KEY, UPDATE ME',
        })
        .onConflict((oc) =>
            oc.column('id').doUpdateSet((eb) => ({
                identifier: eb.ref('excluded.identifier'),
                name: eb.ref('excluded.name'),
            })),
        )
        .returning('id')
        .execute()

    await db
        .insertInto('user')
        .values({
            name: 'Test Researcher User',
            clerk_id: 'user_2nGGaoA3H84uqeBOHCz8Ou9iAvZ',
            is_researcher: true,
        })
        .returning('id')
        .onConflict((oc) =>
            oc.column('clerk_id').doUpdateSet((eb) => ({
                clerk_id: eb.ref('excluded.clerk_id'),
            })),
        )
        .execute()
}
