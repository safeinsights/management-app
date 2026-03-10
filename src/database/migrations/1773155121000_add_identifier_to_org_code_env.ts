import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
    await db.schema
        .alterTable('org_code_env')
        .addColumn('identifier', 'varchar', (col) => col.notNull().defaultTo(''))
        .execute()

    // Populate existing rows with a slug derived from the name
    await sql`
        UPDATE org_code_env
        SET identifier = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
    `.execute(db)

    await db.schema
        .alterTable('org_code_env')
        .addUniqueConstraint('org_code_env_org_id_identifier_unique', ['org_id', 'identifier'])
        .execute()

    await db.schema.alterTable('org_code_env').renameColumn('sample_data_format', 'data_source_type').execute()
}

export async function down(db: Kysely<never>): Promise<void> {
    await db.schema.alterTable('org_code_env').renameColumn('data_source_type', 'sample_data_format').execute()

    await db.schema
        .alterTable('org_code_env')
        .dropConstraint('org_code_env_org_id_identifier_unique')
        .execute()

    await db.schema.alterTable('org_code_env').dropColumn('identifier').execute()
}
