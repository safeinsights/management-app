import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // OTTER-916: an older Clerk sync stored '' for accounts with no email, and Mailgun rejects '' as a missing "to".
    // btrim() trims only spaces, so tabs and newlines need the character class.
    await sql`UPDATE "user" SET email = NULL WHERE email ~ '^[[:space:]]*$'`.execute(db)

    await sql`
        ALTER TABLE "user"
        ADD CONSTRAINT user_email_not_blank
        CHECK (email IS NULL OR email !~ '^[[:space:]]*$')
    `.execute(db)
}

// The blank emails that up() cleared cannot be restored.
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_email_not_blank`.execute(db)
}
