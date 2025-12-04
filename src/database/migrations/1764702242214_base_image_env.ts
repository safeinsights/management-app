import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('org_base_image')
        .addColumn('env_vars', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`).notNull())
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_base_image').dropColumn('env_vars').execute()
}
