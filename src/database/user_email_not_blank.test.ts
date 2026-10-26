import { type Kysely, sql } from 'kysely'
import { db, describe, expect, faker, insertTestOrg, insertTestUser, it } from '@/tests/unit.helpers'
import { up } from './migrations/1787800000000_user_email_not_blank'

const BLANK_EMAILS = ['', '   ', '\t', '\n', ' \t\r\n ']

// pg_temp comes first in the search path, so up() changes this shadow table instead of the real one,
// whose ALTER TABLE would lock out parallel test workers.
async function withShadowUserTable(run: (trx: Kysely<unknown>) => Promise<void>) {
    await db.transaction().execute(async (trx) => {
        const raw = trx as unknown as Kysely<unknown>

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
            const emails = [...BLANK_EMAILS, null, 'kept@test.com']
            await sql`INSERT INTO "user" (email) SELECT unnest(${emails}::text[])`.execute(trx)

            await up(trx)

            const { rows } = await sql<{ email: string | null }>`SELECT email FROM "user"`.execute(trx)
            const kept = rows.map((row) => row.email).filter((email) => email !== null)
            expect(kept).toEqual(['kept@test.com'])
            expect(rows).toHaveLength(emails.length)
        })
    })
})

describe('user_email_not_blank constraint', () => {
    it.each(BLANK_EMAILS)('rejects the email %j', async (email) => {
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
