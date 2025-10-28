import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').renameColumn('url', 'base_image_url').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').renameColumn('base_image_url', 'url').execute()
}
