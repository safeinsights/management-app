import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // A retried/re-delivered ingest webhook used to insert a second study_job_file row for the same
    // job + storage path (same S3 object, new id), surfacing as duplicate log/result rows in the
    // reviewer and researcher views (OTTER-642). Collapse any existing duplicates before enforcing
    // the invariant, keeping one row per (study_job_id, path). Which row holds recipient keys after an
    // approval is not pinned down (buildSharedFiles keys whichever row id the client referenced, and
    // the row lookups have no ORDER BY), so rank rows that already have recipient keys first, then fall
    // back to the earliest row. That keeps a keyed row whenever one exists regardless of insertion
    // order, and study_job_file_recipient_key cascades on delete so orphaned keys of the dropped
    // (key-less) duplicates are removed with them.
    await sql`
        DELETE FROM study_job_file
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY study_job_id, path
                    ORDER BY (
                        SELECT count(*) FROM study_job_file_recipient_key k
                        WHERE k.study_job_file_id = study_job_file.id
                    ) DESC, created_at ASC, id ASC
                ) AS rn
                FROM study_job_file
            ) ranked
            WHERE ranked.rn > 1
        )
    `.execute(db)

    await db.schema
        .createIndex('study_job_file_study_job_id_path_unique')
        .on('study_job_file')
        .columns(['study_job_id', 'path'])
        .unique()
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_job_file_study_job_id_path_unique').execute()
}
