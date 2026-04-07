import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('submitted_at', 'timestamp').execute()

    // Backfill: for non-draft studies, set submittedAt to createdAt
    await sql`UPDATE "study" SET "submitted_at" = "created_at" WHERE "status" != 'DRAFT'`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('submitted_at').execute()
}
