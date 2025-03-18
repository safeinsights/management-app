import type { Kysely } from 'kysely'
import { DB } from '@/database/types'

export async function up(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('memberUserPublicKey').renameColumn('value', 'publicKey').execute()
    await db.schema.alterTable('memberUserPublicKey').addUniqueConstraint('unique_user_id', ['userId']).execute()
    await db.schema.alterTable('memberUserPublicKey').renameTo('userPublicKey').execute()
}

export async function down(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('userPublicKey').renameTo('memberUserPublicKey').execute()
}
