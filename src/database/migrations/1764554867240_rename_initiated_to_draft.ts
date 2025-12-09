import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE "study_status" RENAME VALUE 'INITIATED' TO 'DRAFT'`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE "study_status" RENAME VALUE 'DRAFT' TO 'INITIATED'`.execute(db)
}
