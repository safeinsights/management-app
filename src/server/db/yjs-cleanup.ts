// Timestamp-bounded delete helpers for the safety-net purges that follow a
// proposal or review submit. Kept out of the action files so they are pure
// helpers rather than server actions, and out of queries.ts/mutations.ts so the
// purge intent is searchable on its own.

import type { Kysely } from 'kysely'

import type { DB } from '@/database/types'
import type { DBExecutor } from '@/database'
import { reviewFeedbackDocNameForVersion, reviewFeedbackLegacyDocName } from '@/lib/collaboration-documents'

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

/**
 * Safety-net delete for the versioned review-feedback Yjs document that was
 * just submitted. Targets the specific `-v${version}` row. The `updatedAt <=
 * beforeAt` bound keeps any post-submit writes intact. By design those would
 * be from a stale client and are rejected by the editor service's persistence
 * gate anyway, but we leave the row alone in case it represents legitimate
 * round-N+1 activity that happened to land on the same name (it can't, because
 * round N+1 is a different `-v` suffix, but the guard is harmless).
 */
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

/**
 * One-shot legacy unversioned row delete. Existing in-flight Yjs rows from
 * before the version-keying change use the unversioned name; sweep them on
 * the next submit so they don't linger forever. Unbounded delete by name;
 * the legacy form is no longer written by anything, so this is safe.
 */
export async function purgeLegacyReviewFeedbackYjsDoc(db: DBExecutor, studyId: string): Promise<void> {
    await db.deleteFrom('yjsDocument').where('name', '=', reviewFeedbackLegacyDocName(studyId)).execute()
}
