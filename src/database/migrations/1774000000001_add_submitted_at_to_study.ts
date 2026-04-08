import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // Guard: column may already exist if the original 1774000000000 timestamp ran before the rename
    await sql`ALTER TABLE "study" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP`.execute(db)

    await sql`UPDATE "study" SET "submitted_at" = "created_at" WHERE "status" != 'DRAFT' AND "submitted_at" IS NULL`.execute(
        db,
    )
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('submitted_at').execute()
}
