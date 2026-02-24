import { type Kysely } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
    await db.schema.alterTable('org_base_image').renameTo('org_code_env').execute()
}

export async function down(db: Kysely<never>): Promise<void> {
    await db.schema.alterTable('org_code_env').renameTo('org_base_image').execute()
}
