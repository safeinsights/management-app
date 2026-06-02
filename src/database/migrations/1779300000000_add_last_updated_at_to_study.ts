import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('last_updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await sql`
        UPDATE study SET last_updated_at = COALESCE(GREATEST(
            study.submitted_at,
            study.approved_at,
            study.rejected_at,
            (
                SELECT MAX(jsc.created_at)
                FROM job_status_change jsc
                INNER JOIN study_job sj ON sj.id = jsc.study_job_id
                WHERE sj.study_id = study.id
            ),
            (
                SELECT MAX(spc.created_at)
                FROM study_proposal_comment spc
                WHERE spc.study_id = study.id
                  AND (spc.entry_type = 'RESUBMISSION-NOTE' OR spc.decision IS NOT NULL)
            ),
            (
                SELECT MAX(src.created_at)
                FROM study_review_comment src
                WHERE src.study_id = study.id
                  AND src.entry_type = 'DECISION'
            )
        ), study.created_at)
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('last_updated_at').execute()
}
