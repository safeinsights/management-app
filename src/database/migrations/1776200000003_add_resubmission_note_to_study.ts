// DELETE THIS FILE before merging.
//
// OTTER-521 originally added a resubmission_note column to the study table.
// That storage was wrong — OTTER-501 introduces a study_proposal_comment table
// with explicit RESUBMISSION-NOTE entry type, and 521 should use that instead.
// Migration is a no-op so it can run safely until the file is removed.
import { type Kysely } from 'kysely'

export async function up(_db: Kysely<unknown>): Promise<void> {
    // intentionally empty — see file-level comment
}

export async function down(_db: Kysely<unknown>): Promise<void> {
    // intentionally empty
}
