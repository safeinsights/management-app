import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('code_resubmission_note_draft', 'text').execute()

    await db.schema.alterTable('study_job').addColumn('resubmission_note', 'jsonb').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_job').dropColumn('resubmission_note').execute()
    await db.schema.alterTable('study').dropColumn('code_resubmission_note_draft').execute()
}
