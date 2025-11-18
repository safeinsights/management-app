import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE "language" ADD VALUE IF NOT EXISTS 'PYTHON'`.execute(db)
}

export async function down(): Promise<void> {
    // cannot remove an enum value in postgres, this would require a complex migration to a new enum
    throw new Error('irreverisible migration, change is too complex to attempt')
}
