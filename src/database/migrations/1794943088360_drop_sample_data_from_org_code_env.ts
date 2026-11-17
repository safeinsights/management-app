import { sql, type Kysely } from 'kysely'

// OTTER-995: the Example Data section is gone, so its two columns and the snapshot key that copied
// data_source_type go too. A study made before this must read like one made after it.
export async function stripDataSourceTypeFromSnapshots(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE study SET code_env_snapshot = code_env_snapshot - 'dataSourceType' WHERE code_env_snapshot ? 'dataSourceType'`.execute(
        db,
    )
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await stripDataSourceTypeFromSnapshots(db)
    await db.schema.alterTable('org_code_env').dropColumn('sample_data_path').dropColumn('data_source_type').execute()
}

// Recreates the columns empty: the dropped values and the stripped snapshot key are not restored.
export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_code_env')
        .addColumn('sample_data_path', 'text')
        .addColumn('data_source_type', 'text')
        .execute()
}
