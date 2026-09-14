import { type Kysely, sql } from 'kysely'

// OTTER-766: outputs decisions were stamped with the code submission round, so a study on its first
// outputs decision showed "Reviewer feedback (v2.0)" after one code resubmit. Renumber the existing
// rows onto the outputs sequence the action now writes.
export async function up(db: Kysely<unknown>): Promise<void> {
    // row_number() over the study cannot hand two rows of one job the same value, so the
    // (study_job_id, review_kind, round) unique constraint holds for every intermediate state of
    // this update; a count of earlier rows carries no such guarantee.
    const renumbered = await sql`
        UPDATE study_review_comment src
        SET round = numbered.rn
        FROM (
            SELECT id, row_number() OVER (PARTITION BY study_id ORDER BY created_at, id) AS rn
            FROM study_review_comment
            WHERE review_kind = 'RESULTS' AND entry_type = 'DECISION'
        ) numbered
        WHERE src.id = numbered.id AND src.round <> numbered.rn
    `.execute(db)
    console.warn(`renumbered ${renumbered.numAffectedRows ?? 0} outputs decision round(s)`)
}

export async function down(): Promise<void> {
    // Deliberately irreversible: the code round these rows carried was the defect, and restoring it
    // would put the wrong version back on the outputs page.
    throw new Error('irreversible: outputs decision rounds must not be reset to the code round')
}
