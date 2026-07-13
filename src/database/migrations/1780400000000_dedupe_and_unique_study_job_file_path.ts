import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // A retried/re-delivered ingest webhook used to insert a second study_job_file row for the same
    // job + storage path (same S3 object, new id), surfacing as duplicate log/result rows in the
    // reviewer and researcher views (OTTER-642). Collapse any existing duplicates before enforcing the
    // invariant, keeping one row per (study_job_id, path). Recipient keys (researcher access to approved
    // results) may be attached to any of the duplicates: which row an approval keyed is not
    // pinned down (buildSharedFiles keys whichever row id the client referenced, and the row lookups
    // have no ORDER BY), and repeated approvals can key different duplicates. So this is done in two
    // steps to avoid losing access.
    //
    // 1. Pick a survivor per (study_job_id, path): the row with the most recipient keys, then the
    //    earliest created_at/id. Copy every key from the other duplicates onto the survivor. Conflicts
    //    are existing grants for the same inner path and recipient, so they can safely be ignored.
    await sql`
        WITH ranked AS (
            SELECT
                id,
                first_value(id) OVER (
                    PARTITION BY study_job_id, path
                    ORDER BY (
                        SELECT count(*) FROM study_job_file_recipient_key k
                        WHERE k.study_job_file_id = study_job_file.id
                    ) DESC, created_at ASC, id ASC
                ) AS keep_id
            FROM study_job_file
        )
        INSERT INTO study_job_file_recipient_key (study_job_file_id, file_path, fingerprint, crypt, created_at)
        SELECT ranked.keep_id, keys.file_path, keys.fingerprint, keys.crypt, keys.created_at
        FROM study_job_file_recipient_key keys
        JOIN ranked ON ranked.id = keys.study_job_file_id
        WHERE ranked.id <> ranked.keep_id
        ON CONFLICT (study_job_file_id, file_path, fingerprint) DO NOTHING
    `.execute(db)

    // 2. Delete the non-survivor duplicates. Their keys are now on the survivor; the original copies
    //    are removed by the ON DELETE CASCADE.
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
