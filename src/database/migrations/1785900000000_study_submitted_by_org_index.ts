import { type Kysely } from 'kysely'

// org_id (the Data Partner side) was already indexed; submitted_by_org_id was not, so every query
// filtering on the Research Lab side seq-scanned study.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createIndex('study_submitted_by_org_indx').on('study').column('submitted_by_org_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_submitted_by_org_indx').execute()
}
