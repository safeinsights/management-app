import { sql, type Kysely } from 'kysely'
import { type DB } from '@/database/types'

export async function up(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('member_user_public_key').renameTo('user_public_key').execute()

    await db.schema.alterTable('user_public_key').renameColumn('value', 'public_key').execute()
    await db.schema.alterTable('user_public_key').addUniqueConstraint('unique_user_id', ['user_id']).execute()

    await db.schema
        .alterTable('user_public_key')
        .alterColumn('public_key', (col) => col.setDataType(sql`bytea USING public_key::bytea`))
        .execute()
}

export async function down(db: Kysely<DB>): Promise<void> {
    await db.schema.alterTable('user_public_key').renameTo('member_user_public_key').execute()
}
