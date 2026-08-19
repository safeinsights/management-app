import { type Kysely } from 'kysely'

// study already indexes org_id (study_member_indx), the Data Partner side. The Research Lab side,
// submitted_by_org_id, had no index, so every query filtering on it seq-scanned study: the org-admin
// Legal center reads one side or the other depending on the viewing org's type, which made the same
// page an index scan for a Data Partner admin and a full scan for a Research Lab admin. The study
// listing and study-request paths filter the same column.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createIndex('study_submitted_by_org_indx').on('study').column('submitted_by_org_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('study_submitted_by_org_indx').execute()
}
