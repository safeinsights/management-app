import { type Kysely, sql } from 'kysely'
import { db, describe, expect, faker, insertTestOrg, insertTestUser, it } from '@/tests/unit.helpers'
import { up } from './migrations/1787800000000_user_email_not_blank'

// pg_temp comes first in the search path, so up() changes this shadow table instead of the real one,
// whose ALTER TABLE would lock out parallel test workers.
async function withShadowUserTable(run: (trx: Kysely<unknown>) => Promise<void>) {
    await db.transaction().execute(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = trx as any as Kysely<unknown>

        await sql`
            CREATE TEMPORARY TABLE "user" (
                id uuid PRIMARY KEY DEFAULT v7uuid(),
                email text
            ) ON COMMIT DROP
        `.execute(raw)

        await run(raw)
    })
}

describe('user_email_not_blank migration', () => {
    it('clears blank and whitespace-only emails and leaves the others alone', async () => {
        await withShadowUserTable(async (trx) => {
            await sql`INSERT INTO "user" (email) VALUES (''), ('   '), (NULL), ('kept@test.com')`.execute(trx)

            await up(trx)

            const { rows } = await sql<{ email: string | null }>`SELECT email FROM "user"`.execute(trx)
            expect(rows.map((row) => row.email).sort()).toEqual(['kept@test.com', null, null, null])
        })
    })
})

describe('user_email_not_blank constraint', () => {
    it.each(['', '   '])('rejects the email %j', async (email) => {
        const org = await insertTestOrg()

        await expect(insertTestUser({ org, email })).rejects.toThrow(/user_email_not_blank/)
    })

    it('allows a user without an email', async () => {
        const user = await db
            .insertInto('user')
            .values({ clerkId: faker.string.alpha(10), firstName: 'Ada' })
            .returning('email')
            .executeTakeFirstOrThrow()

        expect(user.email).toBeNull()
    })
})
