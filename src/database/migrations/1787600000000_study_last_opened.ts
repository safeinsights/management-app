import { type Kysely, sql } from 'kysely'

// OTTER-838: when each person last opened each study, so a study whose Last updated is newer reads
// as unread. Kept apart from the audit log, which is a compliance record and not UI state.

// Existing studies start as opened at deploy for everyone who can see them, so only changes made
// after the release mark a study, rather than every old study at once.
export async function backfillStudyLastOpened(db: Kysely<unknown>) {
    await sql`
        INSERT INTO study_last_opened (study_id, user_id, opened_at)
        SELECT study.id, org_user.user_id, now()
        FROM study
        JOIN org_user ON org_user.org_id = study.submitted_by_org_id
        WHERE study.deleted_at IS NULL
        UNION
        SELECT study.id, org_user.user_id, now()
        FROM study
        JOIN org_user ON org_user.org_id = study.org_id
        WHERE study.deleted_at IS NULL AND study.status <> 'DRAFT'
        ON CONFLICT DO NOTHING
    `.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('study_last_opened')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('study_id', 'uuid', (col) => col.notNull().references('study.id').onDelete('cascade'))
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id').onDelete('cascade'))
        .addColumn('opened_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('study_last_opened_user_study_unique', ['user_id', 'study_id'])
        .execute()

    await backfillStudyLastOpened(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('study_last_opened').ifExists().execute()
}
