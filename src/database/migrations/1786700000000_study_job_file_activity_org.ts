import { type Kysely, sql } from 'kysely'

// OTTER-783: the "Last activity" column showed the Data Partner's reviewers to the Research Lab and
// vice versa, because a row only knew WHO acted, not which side they acted for. Stamp the org.

// A member of the study's Data Partner acted for it; anyone else (the researcher, or a member since
// removed) is attributed to the submitting lab. Dual-role users cannot be told apart after the
// fact, so the enclave side wins for them.
export async function backfillActivityOrg(db: Kysely<unknown>): Promise<void> {
    await sql`
        UPDATE study_job_file_activity activity
        SET org_id = CASE
            WHEN EXISTS (
                SELECT 1 FROM org_user
                WHERE org_user.user_id = activity.user_id AND org_user.org_id = study.org_id
            ) THEN study.org_id
            ELSE study.submitted_by_org_id
        END
        FROM study_job_file
        JOIN study_job ON study_job.id = study_job_file.study_job_id
        JOIN study ON study.id = study_job.study_id
        WHERE study_job_file.id = activity.study_job_file_id
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_job_file_activity')
        .addColumn('org_id', 'uuid', (col) => col.references('org.id').onDelete('cascade'))
        .execute()

    await backfillActivityOrg(db)

    await db.schema
        .alterTable('study_job_file_activity')
        .alterColumn('org_id', (col) => col.setNotNull())
        .execute()

    // The column is always read for one side, so the org belongs in the index ahead of the path.
    await db.schema.dropIndex('study_job_file_activity_file_created_idx').execute()
    await db.schema
        .createIndex('study_job_file_activity_file_org_created_idx')
        .on('study_job_file_activity')
        .columns(['study_job_file_id', 'org_id', 'file_path', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_job_file_activity_file_org_created_idx').execute()
    await db.schema
        .createIndex('study_job_file_activity_file_created_idx')
        .on('study_job_file_activity')
        .columns(['study_job_file_id', 'file_path', 'created_at desc'])
        .execute()
    await db.schema.alterTable('study_job_file_activity').dropColumn('org_id').execute()
}
