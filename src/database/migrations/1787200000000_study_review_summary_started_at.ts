import { type Kysely } from 'kysely'

// OTTER-799: generation wrote nothing until it finished, so an absent row meant "queued", "running"
// and "died" at once. A run now records when it claimed the round, which lets a second run refuse
// to duplicate a live one and lets the reviewer be told the difference.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_review').addColumn('summary_started_at', 'timestamptz').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study_review').dropColumn('summary_started_at').execute()
}
