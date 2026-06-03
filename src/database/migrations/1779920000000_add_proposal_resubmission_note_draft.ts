import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('proposal_resubmission_note_draft', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('proposal_resubmission_note_draft').execute()
}
