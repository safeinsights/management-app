import { type Kysely, sql } from 'kysely'

// Researcher Profile
// - Stored separately so only opted-in users have these fields.
// - Uses a single table with JSON/arrays for simplicity (Option A).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('researcher_profile')
        // One profile per user
        .addColumn('user_id', 'uuid', (col) => col.primaryKey().references('user.id').onDelete('cascade'))

        // Highest level of education
        .addColumn('education_institution', 'text')
        .addColumn('education_degree', 'text')
        .addColumn('education_field_of_study', 'text')
        .addColumn('education_is_currently_pursuing', 'boolean', (col) => col.notNull().defaultTo(false))

        // Current institutional positions (array of { affiliation, position, profileUrl? })
        .addColumn('current_positions', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))

        // Research details
        .addColumn('research_interests', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
        .addColumn('detailed_publications_url', 'text')
        .addColumn('featured_publications_urls', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))

        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema.createIndex('researcher_profile_user_id_idx').on('researcher_profile').column('user_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('researcher_profile').execute()
}
