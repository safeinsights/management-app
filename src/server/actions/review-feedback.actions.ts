'use server'

import { type DBExecutor } from '@/database'
import { ActionSuccessType } from '@/lib/types'
import { getProposalFeedbackForStudy } from '@/server/db/queries'
import { Action, z } from './action'
import { withStudyAccessSubject } from './study-subject'

export const getProposalFeedbackForStudyAction = new Action('getProposalFeedbackForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId } }) => (await getProposalFeedbackForStudy(studyId)).entries)

export type ProposalFeedbackEntry = ActionSuccessType<typeof getProposalFeedbackForStudyAction>[number]

// The code-phase thread: reviewer decisions interleaved with the researcher's resubmission notes.
// The outputs phase deliberately carries neither the notes nor this version scheme (OTTER-766), so
// it reads its decisions through getOutputsDecisionFeedbackAction instead.
async function loadCodeReviewFeedbackThread(db: DBExecutor, studyId: string) {
    const rows = await db
        .selectFrom('studyReviewComment')
        .innerJoin('user as author', 'author.id', 'studyReviewComment.authorId')
        .select([
            'studyReviewComment.id',
            'studyReviewComment.authorId',
            'studyReviewComment.entryType',
            'studyReviewComment.decision',
            'studyReviewComment.body',
            'studyReviewComment.criteria',
            'studyReviewComment.createdAt',
            'studyReviewComment.round',
            'author.fullName as authorName',
        ])
        .where('studyReviewComment.studyId', '=', studyId)
        .where('studyReviewComment.reviewKind', '=', 'CODE')
        .where('studyReviewComment.entryType', 'in', ['DECISION', 'RESUBMISSION-NOTE'])
        .orderBy('studyReviewComment.createdAt', 'desc')
        .orderBy('studyReviewComment.round', 'desc')
        // Enum order lists DECISION before RESUBMISSION-NOTE: on a round, the decision is the newer.
        .orderBy('studyReviewComment.entryType', 'asc')
        .orderBy('studyReviewComment.id', 'desc')
        .execute()

    return rows.map((row) => ({
        id: row.id,
        authorId: row.authorId,
        entryType: row.entryType === 'DECISION' ? ('REVIEWER-FEEDBACK' as const) : ('RESUBMISSION-NOTE' as const),
        decision: row.decision,
        body: row.body,
        criteria: row.criteria,
        createdAt: row.createdAt,
        authorName: row.authorName,
        version: row.round,
    }))
}

export const getCodeReviewFeedbackAction = new Action('getCodeReviewFeedbackAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => loadCodeReviewFeedbackThread(db, studyId))

export type CodeReviewFeedbackEntry = ActionSuccessType<typeof getCodeReviewFeedbackAction>[number]

// The whole outputs thread, for the reviewer's post-review page and for all three researcher
// outputs screens: reviewer decisions alone, with no code-phase resubmission notes (OTTER-766).
export const getOutputsDecisionFeedbackAction = new Action('getOutputsDecisionFeedbackAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => {
        const rows = await db
            .selectFrom('studyReviewComment')
            .innerJoin('user as author', 'author.id', 'studyReviewComment.authorId')
            .select([
                'studyReviewComment.id',
                'studyReviewComment.authorId',
                'studyReviewComment.decision',
                'studyReviewComment.body',
                'studyReviewComment.createdAt',
                'studyReviewComment.round',
                'author.fullName as authorName',
            ])
            .where('studyReviewComment.studyId', '=', studyId)
            .where('studyReviewComment.reviewKind', '=', 'RESULTS')
            .where('studyReviewComment.entryType', '=', 'DECISION')
            .orderBy('studyReviewComment.createdAt', 'desc')
            // Two decisions can land in the same millisecond, and an unstable order would let them
            // swap places between renders.
            .orderBy('studyReviewComment.id', 'desc')
            .execute()

        // Outputs decisions carry no criteria, unlike code reviews.
        return rows.map((row) => ({
            id: row.id,
            authorId: row.authorId,
            entryType: 'REVIEWER-FEEDBACK' as const,
            decision: row.decision,
            body: row.body,
            createdAt: row.createdAt,
            authorName: row.authorName,
            version: row.round ?? null,
        }))
    })

export type OutputsDecisionFeedbackEntry = ActionSuccessType<typeof getOutputsDecisionFeedbackAction>[number]
