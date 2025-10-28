import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').addColumn('starter_code_path', 'text').execute()

    await sql`update org_base_image set starter_code_path = 'invalid'`.execute(db)
    await db.schema
        .alterTable('org_base_image')
        .alterColumn('starter_code_path', (col) => col.setNotNull())
        .execute()

}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').dropColumn('starter_code_path').execute()
}
