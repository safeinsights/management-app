import { type Kysely, sql } from 'kysely'

// Researcher Profile - stored separately so only opted-in users have these fields

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('researcher_profile')
        // One profile per user
        .addColumn('user_id', 'uuid', (col) => col.primaryKey().references('user.id').onDelete('cascade'))

        // Highest level of education
        .addColumn('education_institution', 'text')
        .addColumn('education_degree', 'text')
        .addColumn('education_field_of_study', 'text')
        .addColumn('education_is_currently_pursuing', 'boolean', (col) => col.notNull().defaultTo(false))

        // Research details
        .addColumn('research_interests', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
        .addColumn('detailed_publications_url', 'text')
        .addColumn('featured_publications_urls', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))

        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema.createIndex('researcher_profile_user_id_idx').on('researcher_profile').column('user_id').execute()

    // Normalized researcher_position table (replaces JSONB positions column)
    await db.schema
        .createTable('researcher_position')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('user_id', 'uuid', (col) =>
            col.notNull().references('researcher_profile.user_id').onDelete('cascade'),
        )
        .addColumn('affiliation', 'text', (col) => col.notNull())
        .addColumn('position', 'text', (col) => col.notNull())
        .addColumn('profile_url', 'text')
        .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema.createIndex('researcher_position_user_id_idx').on('researcher_position').column('user_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('researcher_position').execute()
    await db.schema.dropTable('researcher_profile').execute()
}
