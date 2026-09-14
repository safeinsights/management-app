import { type Kysely, sql } from 'kysely'

// OTTER-766: outputs decisions were stamped with the code submission round, so a study on its first
// outputs decision showed "Reviewer feedback (v2.0)" after one code resubmit. Renumber the existing
// rows onto the outputs sequence the action now writes.

// review_kind is cast to text because 'RESULTS' is added by an earlier migration in this same
// transaction, and Postgres rejects comparing it as the enum ("unsafe use of new value").
const OUTPUTS_DECISIONS = sql`review_kind::text = 'RESULTS' AND entry_type = 'DECISION'`

const PARK_OFFSET = 1000000

export async function up(db: Kysely<unknown>): Promise<void> {
    // (study_job_id, review_kind, round) is not deferrable, so Postgres checks it row by row while a
    // single UPDATE rewrites the table and a job shifting 2,3 -> 1,2 can collide with its own
    // not-yet-rewritten row. Parking on an unoccupied range first keeps both steps collision-free.
    await sql`
        UPDATE study_review_comment SET round = round + ${sql.lit(PARK_OFFSET)} WHERE ${OUTPUTS_DECISIONS}
    `.execute(db)

    const renumbered = await sql`
        UPDATE study_review_comment src
        SET round = numbered.rn
        FROM (
            SELECT id, row_number() OVER (PARTITION BY study_id ORDER BY created_at, id) AS rn
            FROM study_review_comment
            WHERE ${OUTPUTS_DECISIONS}
        ) numbered
        WHERE src.id = numbered.id
    `.execute(db)
    console.warn(`renumbered ${renumbered.numAffectedRows ?? 0} outputs decision round(s)`)
}

export async function down(): Promise<void> {
    // Deliberately irreversible: the code round these rows carried was the defect, and restoring it
    // would put the wrong version back on the outputs page.
    throw new Error('irreversible: outputs decision rounds must not be reset to the code round')
}
