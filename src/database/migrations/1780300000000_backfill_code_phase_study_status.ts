import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Code submit/resubmit used to flip an approved study back to PENDING-REVIEW
    // (undone by the next code decision). That flip is removed; restore the
    // resting APPROVED status for rows caught mid-code-review. approved_at is
    // the durable record of the proposal decision, so it is the discriminator:
    // proposal-stage PENDING-REVIEW rows have approved_at NULL and are untouched.
    await sql`
        UPDATE study
        SET status = 'APPROVED'
        WHERE status = 'PENDING-REVIEW' AND approved_at IS NOT NULL
    `.execute(db)
}

export async function down(): Promise<void> {
    // The flipped rows are indistinguishable after the fact (approved_at remains
    // the durable record either way) and the legacy state is retired, so there
    // is nothing to restore.
}
