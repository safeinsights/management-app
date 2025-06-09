import { type Kysely, sql } from 'kysely'
import { DB } from '../types'

export async function createOrgBaseImageTable(db: Kysely<DB>): Promise<void> {
    await db.schema
        .createTable('orgBaseImage')
        .addColumn('id', 'varchar', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('orgId', 'varchar', (col) => col.notNull().references('org.id').onDelete('cascade'))
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('language', 'varchar', (col) => col.notNull())
        .addColumn('accessPermissions', 'jsonb', (col) => col)
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('orgBaseImage_org_language_unique')
        .on('orgBaseImage')
        .columns(['orgId', 'language'])
        .unique()
        .execute()
}
