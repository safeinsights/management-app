import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('latest_reviewer_id', 'uuid', (col) => col.references('user.id'))
        .execute()

    // Backfill from the most recent proposal / code / results review event per study.
    await sql`
        UPDATE study
        SET latest_reviewer_id = sub.user_id
        FROM (
            SELECT DISTINCT ON (s.id) s.id AS study_id, review_events.user_id
            FROM study s
            INNER JOIN LATERAL (
                SELECT author_id AS user_id, created_at
                FROM study_proposal_comment
                WHERE study_id = s.id AND decision IS NOT NULL
                UNION ALL
                SELECT author_id, created_at
                FROM study_review_comment
                WHERE study_id = s.id AND entry_type = 'DECISION'
                UNION ALL
                SELECT jsc.user_id, jsc.created_at
                FROM job_status_change jsc
                INNER JOIN study_job sj ON sj.id = jsc.study_job_id
                WHERE sj.study_id = s.id
                  AND jsc.status IN ('FILES-APPROVED', 'FILES-REJECTED')
                  AND jsc.user_id IS NOT NULL
            ) review_events ON TRUE
            ORDER BY s.id, review_events.created_at DESC
        ) sub
        WHERE study.id = sub.study_id
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('latest_reviewer_id').execute()
}
