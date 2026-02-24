import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createType('study_job_file_type')
        .asEnum([
            'MAIN-CODE',
            'SUPPLEMENTAL-CODE',
            'ENCRYPTED-RESULT',
            'APPROVED-RESULT',
            'ENCRYPTED-CODE-RUN-LOG',
            'APPROVED-CODE-RUN-LOG',
            'ENCRYPTED-SECURITY-SCAN-LOG',
            'APPROVED-SECURITY-SCAN-LOG',
            'ENCRYPTED-PACKAGING-ERROR-LOG',
            'APPROVED-PACKAGING-ERROR-LOG',
        ])
        .execute()

    await sql`
        ALTER TABLE study_job_file
            ALTER COLUMN file_type TYPE study_job_file_type
            USING CASE
                WHEN file_type::text = 'ENCRYPTED-LOG' THEN 'ENCRYPTED-CODE-RUN-LOG'::study_job_file_type
                WHEN file_type::text = 'APPROVED-LOG' THEN 'APPROVED-CODE-RUN-LOG'::study_job_file_type
                ELSE file_type::text::study_job_file_type
            END
    `.execute(db)

    await sql`DROP TYPE file_type`.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
    // no-op — irreversible enum rename
}
