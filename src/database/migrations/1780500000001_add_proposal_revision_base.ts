import { type Kysely, sql } from 'kysely'

// OTTER-636: the active-revision discriminator. A study.status of DRAFT is now ambiguous between a
// brand-new fresh draft and a revision of a previously submitted (change-requested) proposal. This FK
// resolves it:
//   - NULL  + status DRAFT  -> fresh unsubmitted draft
//   - set   + status DRAFT  -> revision draft, pointing at the immutable submitted snapshot being revised
//   - NULL  for every non-DRAFT status
// The check constraint enforces that a base id may only be set while the study is a DRAFT.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('proposal_revision_base_submission_id', 'uuid', (col) =>
            col.references('study_proposal_submission.id'),
        )
        .execute()

    await sql`
        ALTER TABLE study
        ADD CONSTRAINT proposal_revision_base_only_when_draft
        CHECK (proposal_revision_base_submission_id IS NULL OR status = 'DRAFT')
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE study DROP CONSTRAINT IF EXISTS proposal_revision_base_only_when_draft`.execute(db)
    await db.schema.alterTable('study').dropColumn('proposal_revision_base_submission_id').execute()
}
