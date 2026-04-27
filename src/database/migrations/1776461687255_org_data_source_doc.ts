import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('org_data_source_document')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('org_data_source_id', 'uuid', (col) =>
            col.notNull().references('org_data_source.id').onDelete('cascade'),
        )
        .addColumn('url', 'text')
        .addColumn('description', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await sql`
          INSERT INTO org_data_source_document (org_data_source_id, url)
          SELECT id, documentation_url
          FROM org_data_source
          WHERE documentation_url IS NOT NULL
      `.execute(db)

    await db.schema.alterTable('org_data_source').dropColumn('documentation_url').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('org_data_source').addColumn('documentation_url', 'text').execute()

    await sql`
          UPDATE org_data_source
          SET documentation_url = j.url
          FROM (
              SELECT DISTINCT ON (org_data_source_id) org_data_source_id, url
              FROM org_data_source_document
              ORDER BY org_data_source_id, created_at ASC
          ) j
          WHERE org_data_source.id = j.org_data_source_id
      `.execute(db)

    await db.schema.dropTable('org_data_source_document').execute()
}
