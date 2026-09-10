import { type Kysely } from 'kysely'

/**
 * OTTER-693: the researcher's main-file choice, saved when they click the star rather than only
 * when they submit. Without it the selection lived in React state alone and a reload lost it,
 * which also made the page's "All changes saved" indicator overstate what had been kept.
 *
 * Draft state on `study`, alongside code_resubmission_note_draft. Nullable: no choice yet is the
 * starting state, and the submit actions still take the name explicitly, so this is what the page
 * restores from, not the source of truth for a submission.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('main_code_file_name', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('main_code_file_name').execute()
}
