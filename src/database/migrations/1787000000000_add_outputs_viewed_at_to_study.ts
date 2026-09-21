import { type Kysely } from 'kysely'

/**
 * OTTER-698: the researcher's outputs pill reads "Outputs need review" until they open the decision,
 * then "Outputs reviewed". Every other status in the matrix is derivable from the study status and
 * the job status set; this one is not, because nothing else records that the researcher looked.
 * Nullable and never cleared, so the first view wins.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').addColumn('outputs_viewed_at', 'timestamptz').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('study').dropColumn('outputs_viewed_at').execute()
}
