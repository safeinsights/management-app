import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // approved_at discriminates rows caught mid-code-review by the now-removed PENDING-REVIEW flip
    // from genuine proposal-stage rows, which have it NULL.
    await sql`
        UPDATE study
        SET status = 'APPROVED'
        WHERE status = 'PENDING-REVIEW' AND approved_at IS NOT NULL
    `.execute(db)
}

export async function down(): Promise<void> {
    // Irreversible: the flipped rows are indistinguishable after the fact.
}
