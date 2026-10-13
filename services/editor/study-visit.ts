// A save moves the study's Last updated, so everyone in the document when it saves has seen it: the
// last editor, who may already have left, and whoever is still connected. Otherwise an edit stored
// just after its author leaves would mark the study unread for that author (OTTER-838).

import type { DbQuery } from './auth.ts'

type MaybeUserContext = { user?: { id?: unknown } } | null | undefined

export function editorUserIds(contexts: unknown[]): string[] {
    const ids = contexts
        .map((context) => (context as MaybeUserContext)?.user?.id)
        .filter((id): id is string => typeof id === 'string')
    return [...new Set(ids)]
}

// Same rule as the app's markStudyOpened: the stamp never moves back.
export async function markStudyOpenedByEditors(
    studyId: string,
    userIds: string[],
    db: Pick<DbQuery, 'query'>,
): Promise<void> {
    if (userIds.length === 0) return

    await db.query(
        `INSERT INTO study_last_opened (study_id, user_id, opened_at)
         SELECT $1::uuid, user_id, clock_timestamp() FROM unnest($2::uuid[]) AS user_id
         ON CONFLICT (user_id, study_id)
         DO UPDATE SET opened_at = greatest(study_last_opened.opened_at, excluded.opened_at)`,
        [studyId, userIds],
    )
}
