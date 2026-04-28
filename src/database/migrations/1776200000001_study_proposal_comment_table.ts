import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createType('review_decision').asEnum(['APPROVE', 'NEEDS-CLARIFICATION', 'REJECT']).execute()
    await db.schema.createType('study_proposal_comment_author_role').asEnum(['REVIEWER', 'RESEARCHER']).execute()
    await db.schema
        .createType('study_proposal_comment_entry_type')
        .asEnum(['REVIEWER-FEEDBACK', 'RESUBMISSION-NOTE'])
        .execute()

    await db.schema
        .createTable('study_proposal_comment')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('author_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('author_role', sql`study_proposal_comment_author_role`, (col) => col.notNull())
        .addColumn('entry_type', sql`study_proposal_comment_entry_type`, (col) => col.notNull())
        .addColumn('decision', sql`review_decision`)
        .addColumn('body', 'jsonb', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await db.schema
        .createIndex('idx_study_proposal_comment_study_created')
        .on('study_proposal_comment')
        .columns(['study_id', 'created_at desc'])
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_proposal_comment').execute()
    await db.schema.dropType('study_proposal_comment_entry_type').execute()
    await db.schema.dropType('study_proposal_comment_author_role').execute()
    await db.schema.dropType('review_decision').execute()
}
