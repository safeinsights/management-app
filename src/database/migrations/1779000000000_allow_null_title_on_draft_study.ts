import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE study ALTER COLUMN title DROP NOT NULL`.execute(db)

    await sql`UPDATE study SET title = NULL WHERE status = 'DRAFT' AND title = 'Untitled Draft'`.execute(db)

    await sql`
        ALTER TABLE study
        ADD CONSTRAINT study_title_required_when_not_draft
        CHECK (status = 'DRAFT' OR (title IS NOT NULL AND length(btrim(title)) > 0))
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE study DROP CONSTRAINT IF EXISTS study_title_required_when_not_draft`.execute(db)
    await sql`UPDATE study SET title = 'Untitled Draft' WHERE title IS NULL`.execute(db)
    await sql`ALTER TABLE study ALTER COLUMN title SET NOT NULL`.execute(db)
}
