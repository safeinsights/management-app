import { type Kysely } from 'kysely'
import { type DB } from '@/database/types'

export async function up(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('member').renameColumn('identifier', 'slug').execute()
}

export async function down(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('member').renameColumn('slug', 'identifier').execute()
}
