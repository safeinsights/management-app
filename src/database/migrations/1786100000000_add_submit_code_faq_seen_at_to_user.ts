import { type Kysely } from 'kysely'

/**
 * OTTER-693: the Submit code page's FAQ opens expanded on a researcher's very first visit and
 * collapsed afterwards, so it needs a per-user "has been here" marker that survives sessions and
 * devices. A nullable timestamp rather than a boolean, matching the two acknowledgement systems
 * already in the schema (legal_document_acknowledgement.acked_at,
 * study.researcher_agreements_acked_at): NULL means never visited, and the value records when.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('user').addColumn('submit_code_faq_seen_at', 'timestamptz').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('user').dropColumn('submit_code_faq_seen_at').execute()
}
