import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_code_env')
        .addColumn('sample_data_path', 'text')
        .addColumn('sample_data_format', 'text')
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_code_env').dropColumn('sample_data_path').dropColumn('sample_data_format').execute()
}
