import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // OTTER-916: the Clerk sync once stored '' for an account with no email, and Mailgun rejects it as a missing "to".
    await sql`UPDATE "user" SET email = NULL WHERE email IS NOT NULL AND length(btrim(email)) = 0`.execute(db)

    await sql`
        ALTER TABLE "user"
        ADD CONSTRAINT user_email_not_blank
        CHECK (email IS NULL OR length(btrim(email)) > 0)
    `.execute(db)
}

// The blank emails that up() cleared cannot be restored.
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_email_not_blank`.execute(db)
}
