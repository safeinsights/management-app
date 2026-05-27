import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('agent_context')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('org_id', 'uuid', (col) => col.references('org.id').onDelete('cascade'))
        .addColumn('content', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_by', 'uuid', (col) => col.references('user.id').onDelete('set null'))
        .addUniqueConstraint(
            'agent_context_name_org_id_unique',
            ['name', 'org_id'],
            (cb) => cb.nullsNotDistinct(), // for org_id, NULL = safeinsights
        )
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('agent_context').execute()
}
