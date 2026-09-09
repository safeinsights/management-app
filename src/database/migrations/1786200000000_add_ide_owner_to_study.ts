import { type Kysely } from 'kysely'

/**
 * OTTER-693: a study's IDE workspace locks to the first researcher who launches it, whether from
 * the Launch IDE button or the pencil in the code files table. Everyone else on the study then
 * sees both controls disabled, named after the owner.
 *
 * Nullable because unclaimed is the starting state and the one the card keys "enabled for every
 * researcher" off. Claimed once and never reassigned by the app — the card sends anyone who needs
 * it moved to support.
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
