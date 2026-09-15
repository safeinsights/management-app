import { type Kysely, sql } from 'kysely'

// legal_document_scope_unique leads with (type, org_id), so a lookup by study alone leaves org_id
// unbounded and scans every SLA row. Partial because only SLAs carry a study.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX legal_document_study_id_indx
        ON legal_document (study_id)
        WHERE study_id IS NOT NULL
    `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX legal_document_study_id_indx`.execute(db)
}
