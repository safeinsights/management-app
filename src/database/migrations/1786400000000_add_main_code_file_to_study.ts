import { type Kysely } from 'kysely'

/**
 * OTTER-693: the main-file choice, saved on the star click so a reload does not lose it. Draft
 * state alongside code_resubmission_note_draft — the submit actions still take the name
 * explicitly, so this is what the page restores from, not the source of truth for a submission.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('main_code_file_name', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('main_code_file_name').execute()
}
