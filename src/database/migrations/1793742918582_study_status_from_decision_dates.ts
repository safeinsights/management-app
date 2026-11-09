import { sql, type Kysely } from 'kysely'

// OTTER-973: study.status alone holds the proposal decision. This stores what the removed approved_at /
// rejected_at fallback read on PENDING-REVIEW, the status older app versions flipped decided studies back to.

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        UPDATE study
        SET status = CASE WHEN approved_at IS NOT NULL THEN 'APPROVED' ELSE 'REJECTED' END::study_status
        WHERE status = 'PENDING-REVIEW'
          AND (approved_at IS NOT NULL OR rejected_at IS NOT NULL)
    `.execute(db)
}

export async function down(): Promise<void> {
    // Irreversible: the earlier status of a changed row is not recorded.
}
