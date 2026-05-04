// Timestamp-bounded delete helpers for the safety-net purges that follow a
// proposal or review submit. Kept out of the action files so they are pure
// helpers rather than server actions, and out of queries.ts/mutations.ts so the
// purge intent is searchable on its own.

import type { Kysely } from 'kysely'

import type { DB } from '@/database/types'
import type { DBExecutor } from '@/database'
import { reviewFeedbackDocName } from '@/lib/collaboration-documents'

export async function purgeProposalYjsDocsBeforeAt(
    db: Kysely<DB>,
    { studyId, beforeAt }: { studyId: string; beforeAt: Date },
): Promise<void> {
    await db
        .deleteFrom('yjsDocument')
        .where('studyId', '=', studyId)
        .where('name', 'like', `proposal-${studyId}-%`)
        .where('updatedAt', '<=', beforeAt)
        .execute()
}

export async function purgeReviewFeedbackYjsDocBeforeAt(
    db: DBExecutor,
    { studyId, beforeAt }: { studyId: string; beforeAt: Date },
): Promise<void> {
    await db
        .deleteFrom('yjsDocument')
        .where('name', '=', reviewFeedbackDocName(studyId))
        .where('updatedAt', '<=', beforeAt)
        .execute()
}
