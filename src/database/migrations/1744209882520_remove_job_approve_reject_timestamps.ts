import type { Kysely } from 'kysely'
import { type DB } from '@/database/types'

export async function up(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('study_job').dropColumn('approved_at').dropColumn('rejected_at').execute()
}

export async function down(db: Kysely<DB>): Promise<void> {
    await db.schema
        .alterTable('study_job')
        .addColumn('approved_at', 'timestamp')
        .addColumn('rejected_at', 'timestamp')
        .execute()
}
