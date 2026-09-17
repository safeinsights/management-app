import { type Kysely, sql } from 'kysely'

// OTTER-779: a change-requested resubmit reuses the job, so one row per job forced the previous
// round's summary to be destroyed to make room and let a run that finished late land in the wrong
// round. Uniqueness moves to (study_job_id, round), following OTTER-638's study_review_comment.

// Numbered by the same rule as codeRoundForJob, reconstructed at the row's own createdAt: closers
// on jobs that precede this one, plus this job's submissions up to that moment. Counting every
// closer instead would advance the round at the change request, which the runtime rule does not do
// until the resubmit lands, and a row written in that window would be filed under a round its job
// never reads (OTTER-779).
//
// A run that finished after the next round had opened still gets numbered into that next round,
// because write time is all a historical row carries. That is what the single row per job already
// showed, so the display of those rows does not get worse here.
//
// status is cast to text because CODE-CHANGES-REQUESTED is added to the enum by an earlier
// migration in this same transaction, which makes comparing as the enum an "unsafe use of new
// value of enum type".
//
// Pinned here rather than imported from CODE_ROUND_CLOSING_JOB_STATUSES: this records the rule that
// ran against production, so a status added later must not renumber rows that are already stored or
// make a fresh database disagree with the migrated one. study_review_round.test.ts compares the two
// lists, so the next status has to decide rather than drift.
export const BACKFILL_CLOSING_JOB_STATUSES = ['CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED'] as const

// `studyId` narrows the rewrite to one study. The migration passes nothing and renumbers every row;
// the unit test passes its own study, so rows a parallel suite leaves on some other job can never
// be collapsed onto one round by a test run.
export async function backfillStudyReviewRound(db: Kysely<unknown>, studyId?: string): Promise<void> {
    const scope = studyId ? sql`AND owner.study_id = ${studyId}::uuid` : sql``
    const closers = sql.join(BACKFILL_CLOSING_JOB_STATUSES.map((status) => sql`${status}`))

    await sql`
        UPDATE study_review sr
        SET round = 1 + (
            SELECT count(*)
            FROM job_status_change closer
            JOIN study_job sibling ON sibling.id = closer.study_job_id
            WHERE sibling.study_id = owner.study_id
              AND (sibling.created_at, sibling.id) < (owner.created_at, owner.id)
              AND closer.status::text IN (${closers})
        ) + greatest(0, (
            SELECT count(*)
            FROM job_status_change submission
            WHERE submission.study_job_id = sr.study_job_id
              AND submission.status::text = 'CODE-SUBMITTED'
              AND submission.created_at <= sr.created_at
        ) - 1)
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
