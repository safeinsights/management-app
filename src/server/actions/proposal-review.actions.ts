'use server'

import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { StudyStatus } from '@/database/types'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { assertDecisionFeedback } from './decision-feedback'
import { toReviewDecision, type Decision } from '@/lib/review-decision'
import { reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { sleep } from '@/lib/utils'
import { currentReviewVersion, latestJobForStudy, fetchUserFullName } from '@/server/db/queries'
import { nextVersionForStudyComment } from '@/server/db/mutations'
import { purgeReviewFeedbackYjsDocBeforeAt } from '@/server/db/yjs-cleanup'
import { deferred, onStudyApproved, onStudyNeedsClarification, onStudyRejected } from '@/server/events'
import { Action, z } from './action'
import { withStudyAccessSubject } from './study-subject'
import { currentDb } from '@/server/request-context'
import { approveJobCode } from '@/server/job-code-approval'

type StudyForApproval = { status: StudyStatus; approvedAt: Date | null; orgId: string; containerLocation: string }

async function performStudyProposalApproval({
    db,
    study,
    studyId,
    userId,
    orgSlug,
}: {
    db: DBExecutor
    study: StudyForApproval
    studyId: string
    userId: string
    orgSlug: string
}) {
    // PENDING-REVIEW + approvedAt IS NULL blocks flipping a DRAFT into a viewable status
    // (OTTER-596), and being atomic settles the OTTER-471 concurrent-decision race.
    const claimed = await db
        .updateTable('study')
        .set({
            status: 'APPROVED',
            approvedAt: new Date(),
            rejectedAt: null,
            reviewerId: userId,
            lastUpdatedAt: new Date(),
        })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        .where('approvedAt', 'is', null)
        .returning('id')
        .executeTakeFirst()

    if (!claimed) {
        throw new ActionFailure({ study: 'has already been decided. Refresh to see the updated status.' })
    }

    onStudyApproved({ studyId, userId })

    const latestJob = await db
        .selectFrom('studyJob')
        .select('id')
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    if (!latestJob) return

    const job = await latestJobForStudy(studyId)

    await approveJobCode({ db, job, study, userId, studyId, orgSlug })
}

async function markStudyRejected({ db, studyId, userId }: { db: DBExecutor; studyId: string; userId: string }) {
    // Same PENDING-REVIEW gate as approval (OTTER-596); atomic for the OTTER-471 race.
    const claimed = await db
        .updateTable('study')
        .set({
            status: 'REJECTED',
            rejectedAt: new Date(),
            approvedAt: null,
            reviewerId: userId,
            lastUpdatedAt: new Date(),
        })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        .where('approvedAt', 'is', null)
        .returning('id')
        .executeTakeFirst()

    if (!claimed) {
        throw new ActionFailure({ study: 'has already been decided. Refresh to see the updated status.' })
    }
}

async function performStudyProposalRejection({
    db,
    studyId,
    userId,
}: {
    db: DBExecutor
    studyId: string
    userId: string
}) {
    await markStudyRejected({ db, studyId, userId })
    onStudyRejected({ studyId, userId })
}

async function claimInitialProposalReviewStudy({
    db,
    studyId,
    userId,
}: {
    db: DBExecutor
    studyId: string
    userId: string
}) {
    const study = await db
        .updateTable('study')
        .set({ reviewerId: userId, lastUpdatedAt: new Date() })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        // Excludes legacy rows left at PENDING-REVIEW by the retired code-submit status flip:
        // those are code-stage and must not be claimable for a proposal review.
        .where('approvedAt', 'is', null)
        .returning(['status', 'approvedAt', 'orgId', 'containerLocation'])
        .executeTakeFirst()

    if (!study) {
        // OTTER-471 race-loser. User-facing wording: surfaces via errorToString to a toast.
        throw new ActionFailure({
            study: 'has already been decided. Refresh to see the updated status.',
        })
    }

    return study
}

async function insertReviewerProposalComment({
    db,
    studyId,
    userId,
    decision,
    body,
}: {
    db: DBExecutor
    studyId: string
    userId: string
    decision: Decision
    body: string
}) {
    await db
        .insertInto('studyProposalComment')
        .values({
            studyId,
            authorId: userId,
            authorRole: 'REVIEWER',
            entryType: 'REVIEWER-FEEDBACK',
            decision: toReviewDecision(decision),
            body: JSON.parse(body),
            version: nextVersionForStudyComment({ studyId, increment: false }),
        })
        .executeTakeFirstOrThrow()
}

// A debounced Hocuspocus persist can commit after the in-tx delete; re-delete rows older than the
// submit timestamp, so a fast clarification -> reopen cycle inside 5s survives.
const purgeReviewFeedbackYjsDocAfterSubmit = deferred(
    async (args: { studyId: string; version: number; beforeAt: Date }) => {
        await sleep({ 5: 'seconds' })
        await purgeReviewFeedbackYjsDocBeforeAt(currentDb(), args)
    },
)

export const submitProposalReviewAction = new Action('submitProposalReviewAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
            feedback: z.string(),
            decision: z.enum(['approve', 'needs-clarification', 'reject']),
            // Revalidated server-side so a stale tab cannot write into the wrong round.
            reviewVersion: z.number().int().positive(),
        }),
    )
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('review', 'Study')
    .handler(async ({ params: { studyId, orgSlug, feedback, decision, reviewVersion }, session, db }) => {
        const userId = session.user.id
        const json = assertDecisionFeedback(feedback, {
            fieldTitle: REVIEW_FEEDBACK_FIELD_TITLE,
            maxCharacters: REVIEW_FEEDBACK_MAX_CHARACTERS,
        })

        const expectedVersion = await currentReviewVersion(studyId)
        if (reviewVersion !== expectedVersion) {
            throw new ActionFailure({
                review: `stale review round ${reviewVersion} (current ${expectedVersion})`,
            })
        }

        const submittedAt = new Date()
        const claimedStudy = await claimInitialProposalReviewStudy({ db, studyId, userId })
        await insertReviewerProposalComment({ db, studyId, userId, decision, body: json })

        const submitterFullName = await fetchUserFullName(userId, db)

        // The next round starts fresh from its own -v{N+1} name.
        await db
            .deleteFrom('yjsDocument')
            .where('name', '=', reviewFeedbackDocNameForVersion(studyId, reviewVersion))
            .execute()

        if (decision === 'approve') {
            await performStudyProposalApproval({ db, study: claimedStudy, studyId, userId, orgSlug })
            purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
            return { submitterFullName }
        }

        if (decision === 'reject') {
            await performStudyProposalRejection({ db, studyId, userId })
            purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
            return { submitterFullName }
        }

        await db
            .updateTable('study')
            .set({
                status: 'CHANGE-REQUESTED',
                reviewerId: userId,
                approvedAt: null,
                rejectedAt: null,
                lastUpdatedAt: new Date(),
            })
            .where('id', '=', studyId)
            .execute()

        onStudyNeedsClarification({ studyId, userId })
        purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
        return { submitterFullName }
    })
