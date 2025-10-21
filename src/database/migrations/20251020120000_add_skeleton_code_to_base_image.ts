import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('orgBaseImage').addColumn('skeleton_code_url', 'text').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('orgBaseImage').dropColumn('skeleton_code_url').execute()
}
