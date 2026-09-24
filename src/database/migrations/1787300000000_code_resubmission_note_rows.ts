import { type Kysely, sql } from 'kysely'

// OTTER-802: a change-requested resubmit reuses the job, so study_job.resubmission_note held one
// note per job and every round after the first overwrote the one before it. Notes move to
// study_review_comment as RESUBMISSION-NOTE rows, one per round beside the reviewer's DECISION,
// the way study_proposal_comment already keeps both sides of the proposal thread.

export type LegacyCodeResubmissionNote = {
    studyJobId: string
    round: number
    body: unknown
}

// The author is the researcher who submitted the round; the row's timestamp is that submission's,
// which is where the old loader placed the note. Jobs whose submission carries no user fall back
// to the study's researcher, because author_id is NOT NULL.
export async function insertCodeResubmissionNotes(db: Kysely<unknown>, notes: LegacyCodeResubmissionNote[]) {
    if (notes.length === 0) return

    const legacy = sql.join(
        notes.map(
            (note) => sql`(${note.studyJobId}::uuid, ${note.round}::integer, ${JSON.stringify(note.body)}::jsonb)`,
        ),
    )

    await sql`
        INSERT INTO study_review_comment
            (study_id, study_job_id, author_id, review_kind, entry_type, body, round, created_at)
        SELECT job.study_id,
               job.id,
               COALESCE(submission.user_id, study.researcher_id),
               'CODE',
               'RESUBMISSION-NOTE',
               legacy.body,
               legacy.round,
               COALESCE(submission.created_at, job.created_at)
        FROM (VALUES ${legacy}) AS legacy(study_job_id, round, body)
        JOIN study_job job ON job.id = legacy.study_job_id
        JOIN study ON study.id = job.study_id
        LEFT JOIN LATERAL (
            SELECT cs.user_id, cs.created_at
            FROM job_status_change cs
            WHERE cs.study_job_id = job.id
              AND cs.status::text = 'CODE-SUBMITTED'
            ORDER BY cs.created_at DESC, cs.id DESC
            LIMIT 1
        ) submission ON true
    `.execute(db)
}

// ADD VALUE would leave 'RESUBMISSION-NOTE' unusable until commit, and the backfill runs in this
// same transaction, so the type is rebuilt instead (the pattern of 1780500000001's down).
async function rebuildEntryTypeEnum(db: Kysely<unknown>, values: string[]) {
    // Literals: CREATE TYPE takes no bind parameters.
    const list = sql.join(values.map((value) => sql.lit(value)))

    await sql`ALTER TABLE study_review_comment DROP CONSTRAINT study_review_comment_decision_requires_value`.execute(db)
    await sql`ALTER TABLE study_review_comment ALTER COLUMN entry_type TYPE text`.execute(db)
    await sql`DROP TYPE study_review_comment_entry_type`.execute(db)
    await sql`CREATE TYPE study_review_comment_entry_type AS ENUM (${list})`.execute(db)
    await sql`
        ALTER TABLE study_review_comment
            ALTER COLUMN entry_type TYPE study_review_comment_entry_type
            USING entry_type::study_review_comment_entry_type
    `.execute(db)
    await sql`
        ALTER TABLE study_review_comment
            ADD CONSTRAINT study_review_comment_decision_requires_value
            CHECK (entry_type <> 'DECISION' OR decision IS NOT NULL)
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await rebuildEntryTypeEnum(db, ['DECISION', 'NOTE', 'RESUBMISSION-NOTE'])

    // A note shares its round with the decision on that round, so entry_type joins the key. Two
    // reviewers racing within one round still collide on their DECISION rows (OTTER-471).
    await db.schema
        .alterTable('study_review_comment')
        .dropConstraint('study_review_comment_one_code_review_per_round')
        .execute()
    await db.schema
        .alterTable('study_review_comment')
        .addUniqueConstraint('study_review_comment_one_entry_per_round', [
            'study_job_id',
            'review_kind',
            'round',
            'entry_type',
        ])
        .execute()

    // Every stored note has carried its round since 1780200000000 backfilled the column, so a null
    // here is corrupt data: the NOT NULL on round stops the migration rather than guessing.
    const legacy = await sql<LegacyCodeResubmissionNote>`
        SELECT id AS "studyJobId", resubmission_round AS round, resubmission_note AS body
        FROM study_job
        WHERE resubmission_note IS NOT NULL
    `.execute(db)
    await insertCodeResubmissionNotes(db, legacy.rows)

    await db.schema.alterTable('study_job').dropColumn('resubmission_note').execute()
    await db.schema.alterTable('study_job').dropColumn('resubmission_round').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_job').addColumn('resubmission_note', 'jsonb').execute()
    await db.schema.alterTable('study_job').addColumn('resubmission_round', 'integer').execute()

    // Lossy: the column holds one note per job, so only each job's latest round survives.
    await sql`
        UPDATE study_job job
        SET resubmission_note = latest.body, resubmission_round = latest.round
        FROM (
            SELECT DISTINCT ON (study_job_id) study_job_id, body, round
            FROM study_review_comment
            WHERE review_kind = 'CODE' AND entry_type = 'RESUBMISSION-NOTE'
            ORDER BY study_job_id, round DESC
        ) latest
        WHERE latest.study_job_id = job.id
    `.execute(db)
    await sql`DELETE FROM study_review_comment WHERE entry_type = 'RESUBMISSION-NOTE'`.execute(db)

    await db.schema
        .alterTable('study_review_comment')
        .dropConstraint('study_review_comment_one_entry_per_round')
        .execute()
    await db.schema
        .alterTable('study_review_comment')
        .addUniqueConstraint('study_review_comment_one_code_review_per_round', ['study_job_id', 'review_kind', 'round'])
        .execute()

    await rebuildEntryTypeEnum(db, ['DECISION', 'NOTE'])
}
