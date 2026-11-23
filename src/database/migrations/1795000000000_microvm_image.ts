import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('microvm_image_status')
        .asEnum(['IMAGE-PENDING', 'IMAGE-RUNNING', 'IMAGE-READY', 'IMAGE-FAILED'])
        .execute()

    // One row for each code environment url, not for each code environment: environments and orgs
    // with the same url share one research IDE image.
    await db.schema
        .createTable('microvm_image')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('url', 'text', (col) => col.notNull().unique())
        .addColumn('status', sql`microvm_image_status`, (col) => col.notNull())
        .addColumn('image_arn', 'text')
        .addColumn('image_version', 'text')
        .addColumn('layer_hash', 'text')
        .addColumn('attempted_layer_hash', 'text')
        .addColumn('error', 'text')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('microvm_image').execute()
    await db.schema.dropType('microvm_image_status').execute()
}
