import { type Kysely } from 'kysely'

// OTTER-846: each column is filtered or joined on, and none had an index leading with it.
const INDEXES = [
    ['study_job_file_study_job_indx', 'study_job_file', 'study_job_id'],
    ['yjs_document_study_indx', 'yjs_document', 'study_id'],
    ['org_data_source_org_indx', 'org_data_source', 'org_id'],
    ['pending_user_claimed_by_user_indx', 'pending_user', 'claimed_by_user_id'],
    ['study_reviewer_indx', 'study', 'reviewer_id'],
    ['study_pi_user_indx', 'study', 'pi_user_id'],
    ['study_ide_owner_indx', 'study', 'ide_owner_id'],
] as const

export async function up(db: Kysely<unknown>): Promise<void> {
    for (const [name, table, column] of INDEXES) {
        await db.schema.createIndex(name).on(table).column(column).execute()
    }
}

export async function down(db: Kysely<unknown>): Promise<void> {
    for (const [name] of INDEXES) {
        await db.schema.dropIndex(name).execute()
    }
}
