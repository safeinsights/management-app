import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org')
        .addColumn('description', 'text')
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org')
        .dropColumn('description')
        .execute()
}
