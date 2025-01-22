import type { Kysely } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seed(db: Kysely<any>): Promise<void> {
    const exists = await db.selectFrom('member').where('identifier', '=', 'openstax').executeTakeFirst()
    if (!exists) {
        await db
            .insertInto('member')
            .values({
                identifier: 'openstax',
                name: 'OpenStax',
                email: 'contact@safeinsights.org',
                public_key: 'BAD KEY, UPDATE ME',
            })
            .returning('id')
            .executeTakeFirstOrThrow()
    }
}
