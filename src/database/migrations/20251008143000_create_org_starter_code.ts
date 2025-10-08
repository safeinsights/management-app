import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('org_starter_code')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('org_id', 'uuid', (col) => col.notNull().references('org.id').onDelete('cascade'))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('language', 'text', (col) => col.notNull())
        .addColumn('file_name', 'text', (col) => col.notNull())
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()

    await sql`
        ALTER TABLE org_starter_code
        ADD CONSTRAINT org_starter_code_language_check
        CHECK (language IN ('r', 'python'))
    `.execute(db)

    //  index on org_id for faster lookups
    await db.schema.createIndex('idx_org_starter_code_org_id').on('org_starter_code').column('org_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('org_starter_code').execute()
}
