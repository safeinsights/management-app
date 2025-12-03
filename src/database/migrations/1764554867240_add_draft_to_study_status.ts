import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TYPE "study_status" ADD VALUE IF NOT EXISTS 'DRAFT'`.execute(db)
}

export async function down(_: Kysely<unknown>): Promise<void> {
    throw new Error('irreverisible migration, change is too complex to attempt')
}
