import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('researcher_agreements_acked_at', 'timestamp', (col) => col.defaultTo(null))
        .addColumn('reviewer_agreements_acked_at', 'timestamp', (col) => col.defaultTo(null))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .dropColumn('researcher_agreements_acked_at')
        .dropColumn('reviewer_agreements_acked_at')
        .execute()
}
