import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // For each email with duplicates, find the keeper (most recently created user)
    // and reassign all studies to that user
    await sql`
        WITH keepers AS (
            SELECT DISTINCT ON (LOWER(email)) id, email
            FROM "user"
            ORDER BY LOWER(email), created_at DESC
        ),
        old_users AS (
            SELECT u.id AS old_id, k.id AS new_id
            FROM "user" u
            JOIN keepers k ON LOWER(u.email) = LOWER(k.email)
            WHERE u.id != k.id
        )
        UPDATE study SET researcher_id = o.new_id
        FROM old_users o
        WHERE study.researcher_id = o.old_id
    `.execute(db)

    await sql`
        WITH keepers AS (
            SELECT DISTINCT ON (LOWER(email)) id, email
            FROM "user"
            ORDER BY LOWER(email), created_at DESC
        ),
        old_users AS (
            SELECT u.id AS old_id, k.id AS new_id
            FROM "user" u
            JOIN keepers k ON LOWER(u.email) = LOWER(k.email)
            WHERE u.id != k.id
        )
        UPDATE study SET reviewer_id = o.new_id
        FROM old_users o
        WHERE study.reviewer_id = o.old_id
    `.execute(db)

    // Now find all duplicate users to delete (keep the most recently created one)
    const duplicateUserIds = sql`
        WITH keepers AS (
            SELECT DISTINCT ON (LOWER(email)) id
            FROM "user"
            ORDER BY LOWER(email), created_at DESC
        )
        SELECT id FROM "user" WHERE id NOT IN (SELECT id FROM keepers)
    `

    // Delete related records first (foreign key constraints)
    await sql`DELETE FROM job_status_change WHERE user_id IN (${duplicateUserIds})`.execute(db)
    await sql`DELETE FROM org_user WHERE user_id IN (${duplicateUserIds})`.execute(db)
    await sql`DELETE FROM user_public_key WHERE user_id IN (${duplicateUserIds})`.execute(db)

    // Now delete the duplicate users
    await sql`DELETE FROM "user" WHERE id IN (${duplicateUserIds})`.execute(db)

    // Create unique index on lowercase email
    await sql`CREATE UNIQUE INDEX user_email_lower_unique ON "user" (LOWER(email))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX user_email_lower_unique`.execute(db)
}
