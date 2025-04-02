import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('member_user_public_key_fingerpring_indx').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createIndex('member_user_public_key_fingerpring_indx')
        .on('member_user_public_key')
        .column('fingerprint')
        .execute()
}
