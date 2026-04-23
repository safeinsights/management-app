import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('review_decision').asEnum(['APPROVE', 'NEEDS-CLARIFICATION', 'REJECT']).execute()

    await db.schema
        .createTable('study_proposal_review')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('reviewer_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('decision', sql`review_decision`, (col) => col.notNull())
        .addColumn('feedback', 'jsonb', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('idx_study_proposal_review_study_created')
        .on('study_proposal_review')
        .columns(['study_id', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_proposal_review').execute()
    await db.schema.dropType('review_decision').execute()
}
