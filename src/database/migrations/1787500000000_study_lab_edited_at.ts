import { type Kysely, sql } from 'kysely'

// OTTER-617: a study's Last updated counts the lab's saved edits, but study.last_updated_at is shared
// with the data partner, so lab-only saves get their own stamp that only the researcher view reads.

// Upload history is the only lab edit stored with a time before this column existed.
export async function backfillLabEditedAt(db: Kysely<unknown>) {
    await sql`
        UPDATE study
        SET lab_edited_at = uploads.at
        FROM (
            SELECT study_id, max(created_at) AS at
            FROM workspace_file_activity
            WHERE action = 'UPLOADED'
            GROUP BY study_id
        ) uploads
        WHERE uploads.study_id = study.id
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('lab_edited_at', 'timestamptz').execute()
    await backfillLabEditedAt(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('lab_edited_at').execute()
}
