import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('scan_status')
        .asEnum(['SCAN-PENDING', 'SCAN-RUNNING', 'SCAN-COMPLETE', 'SCAN-FAILED'])
        .execute()

    await db.schema
        .createTable('code_scan')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('code_env_id', 'uuid', (col) => col.notNull().references('org_code_env.id').onDelete('cascade'))
        .addColumn('status', sql`scan_status`, (col) => col.notNull())
        .addColumn('results', 'text')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('idx_code_scan_code_env_created')
        .on('code_scan')
        .columns(['code_env_id', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('code_scan').execute()
    await db.schema.dropType('scan_status').execute()
}
