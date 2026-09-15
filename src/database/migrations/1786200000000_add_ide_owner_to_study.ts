import { type Kysely } from 'kysely'

/**
 * OTTER-693: a study's IDE locks to the first researcher who launches it; everyone else on the
 * study then sees the controls disabled, named after the owner. Nullable because unclaimed is the
 * starting state. Claimed once and never reassigned by the app — the card routes those to support.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study')
        .addColumn('ide_owner_id', 'uuid', (col) => col.references('user.id'))
        .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('ide_owner_id').execute()
}
