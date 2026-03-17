import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('org_data_source_code_env')
        .addColumn('data_source_id', 'uuid', (col) =>
            col.notNull().references('org_data_source.id').onDelete('cascade'),
        )
        .addColumn('code_env_id', 'uuid', (col) => col.notNull().references('org_code_env.id').onDelete('restrict'))
        .addPrimaryKeyConstraint('org_data_source_code_env_pk', ['data_source_id', 'code_env_id'])
        .execute()

    await sql`INSERT INTO org_data_source_code_env (data_source_id, code_env_id) SELECT id, code_env_id FROM org_data_source WHERE code_env_id IS NOT NULL`.execute(
        db,
    )

    await db.schema.alterTable('org_data_source').dropColumn('code_env_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_data_source')
        .addColumn('code_env_id', 'uuid', (col) => col.references('org_code_env.id').onDelete('restrict'))
        .execute()

    await sql`UPDATE org_data_source SET code_env_id = j.code_env_id FROM (SELECT DISTINCT ON (data_source_id) data_source_id, code_env_id FROM org_data_source_code_env) j WHERE org_data_source.id = j.data_source_id`.execute(
        db,
    )

    await db.schema.dropTable('org_data_source_code_env').execute()
}
