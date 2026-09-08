import type { Kysely } from 'kysely'

import type { DB } from '@/database/types'
import type { DBExecutor } from '@/database'
import { codeReviewFeedbackDocName, reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'

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

// The updatedAt <= beforeAt bound leaves a post-submit write intact, in case it is legitimate
// round-N+1 activity.
export async function purgeReviewFeedbackYjsDocBeforeAt(
    db: DBExecutor,
    { studyId, version, beforeAt }: { studyId: string; version: number; beforeAt: Date },
): Promise<void> {
    await db
        .deleteFrom('yjsDocument')
        .where('name', '=', reviewFeedbackDocNameForVersion(studyId, version))
        .where('updatedAt', '<=', beforeAt)
        .execute()
}

// Code-review doc names are job-keyed and never reused, so no updatedAt bound is needed.
export async function purgeCodeReviewFeedbackYjsDoc(db: DBExecutor, { jobId }: { jobId: string }): Promise<void> {
    await db.deleteFrom('yjsDocument').where('name', '=', codeReviewFeedbackDocName(jobId)).execute()
}
