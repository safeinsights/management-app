import { sql, type Kysely } from 'kysely'

// OTTER-973: study.status alone now holds the proposal decision. The app used to read a study with no
// decision status but an approved_at or rejected_at as approved or rejected; this stores that reading,
// so no study changes how it shows. Current app code writes no such row; this catches older ones. The
// status is compared as text: a fresh database runs all migrations in one transaction, where Postgres
// refuses CHANGE-REQUESTED, which an earlier migration in it added.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        UPDATE study
        SET status = CASE WHEN approved_at IS NOT NULL THEN 'APPROVED' ELSE 'REJECTED' END::study_status
        WHERE status::text NOT IN ('APPROVED', 'REJECTED', 'CHANGE-REQUESTED')
          AND (approved_at IS NOT NULL OR rejected_at IS NOT NULL)
    `.execute(db)
}

export async function down(): Promise<void> {
    // Irreversible: the earlier status of a changed row is not recorded.
}
