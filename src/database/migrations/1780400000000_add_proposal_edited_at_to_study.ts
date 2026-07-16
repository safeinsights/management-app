import { type Kysely } from 'kysely'

// OTTER-636: display-only "Proposal draft" signal. When a researcher makes a real edit to a
// change-requested proposal, this timestamp is stamped so the dashboard can read "Proposal draft"
// without flipping study.status (which would break the CHANGE-REQUESTED-gated resubmission flow).
// Cleared on resubmit.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('proposal_edited_at', 'timestamptz').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('proposal_edited_at').execute()
}
