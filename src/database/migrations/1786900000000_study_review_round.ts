import { type Kysely, sql } from 'kysely'

// OTTER-779: a change-requested resubmit reuses the job, so one row per job forced the previous
// round's summary to be destroyed to make room and let a run that finished late land in the wrong
// round. Uniqueness moves to (study_job_id, round), following OTTER-638's study_review_comment.

// status is cast to text because CODE-CHANGES-REQUESTED is added to the enum by an earlier
// migration in this same transaction, which makes comparing as the enum an "unsafe use of new
// value of enum type".
//
// `studyId` narrows the rewrite to one study. The migration passes nothing and renumbers every row;
// the unit test passes its own study, so rows a parallel suite leaves on some other job can never
// be collapsed onto one round by a test run.
export async function backfillStudyReviewRound(db: Kysely<unknown>, studyId?: string): Promise<void> {
    const scope = studyId ? sql`AND owner.study_id = ${studyId}::uuid` : sql``

    await sql`
        UPDATE study_review sr
        SET round = 1 + (
            SELECT count(*)
            FROM job_status_change closer
            JOIN study_job sibling ON sibling.id = closer.study_job_id
            WHERE sibling.study_id = owner.study_id
              AND closer.status::text IN ('CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED')
              AND closer.created_at < sr.created_at
        )
        FROM study_job owner
        WHERE owner.id = sr.study_job_id
        ${scope}
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_review')
        .addColumn('round', 'integer', (col) => col.notNull().defaultTo(1))
        .execute()

    // Runs while the per-job unique index still holds, so there is at most one row per job and the
    // renumbering cannot collide with a row it has not rewritten yet.
    await backfillStudyReviewRound(db)

    await db.schema.dropIndex('study_review_study_job_id_unique').execute()
    await db.schema
        .createIndex('study_review_study_job_id_round_unique')
        .on('study_review')
        .columns(['study_job_id', 'round'])
        .unique()
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_review_study_job_id_round_unique').execute()

    // Lossy: one row per job cannot be restored without dropping every round but the latest.
    await sql`
        DELETE FROM study_review a
        USING study_review b
        WHERE a.study_job_id = b.study_job_id
          AND a.round < b.round
    `.execute(db)

    await db.schema
        .createIndex('study_review_study_job_id_unique')
        .on('study_review')
        .column('study_job_id')
        .unique()
        .execute()

    await db.schema.alterTable('study_review').dropColumn('round').execute()
}
