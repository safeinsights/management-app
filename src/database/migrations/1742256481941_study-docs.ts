import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .dropColumn('description')
        .addColumn('irb_doc_path', 'text')
        .addColumn('description_doc_path', 'text')
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('description', 'text')
        .dropColumn('irb_doc_path')
        .dropColumn('description_doc_path')
        .execute()
}
