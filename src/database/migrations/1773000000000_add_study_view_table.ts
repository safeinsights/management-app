import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study_view')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
        .addColumn('study_status_at_view', sql`study_status`)
        .addColumn('job_status_at_view', sql`study_job_status`)
        .addColumn('viewed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_study_view_study_user', ['study_id', 'user_id'])
        .execute()

    await db.schema.createIndex('idx_study_view_user_study').on('study_view').columns(['user_id', 'study_id']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_view').execute()
}
