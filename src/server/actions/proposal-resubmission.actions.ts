'use server'

import { countCharacters } from '@/lib/field-limits'
import { Routes } from '@/lib/routes'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { withStudySubject } from '@/server/actions/study-subject'
import { markStudyOpened, nextVersionForStudyComment } from '@/server/db/mutations'
import { onStudyProposalResubmitted } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { STUDY_TITLE_MAX_CHARACTERS, STUDY_TITLE_OVER_LIMIT_ERROR, draftStudyApiSchema } from '@/schema/study-request'
import { resubmissionNoteToLexicalJson, resubmissionNoteParam } from '@/schema/resubmission-note'
import { purgeProposalYjsDocsAfterFinalize } from '@/server/study-submission'

const proposalUpdatableFields = [
    'title',
    'piName',
    'piUserId',
    'datasets',
    'researchQuestions',
    'projectSummary',
    'impact',
    'additionalNotes',
] as const

export const resubmitProposalAction = new Action('resubmitProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.uuid(),
            studyInfo: draftStudyApiSchema,
            resubmissionNote: resubmissionNoteParam,
        }),
    )
    .middleware(withStudySubject)
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo, resubmissionNote }, session, orgSlug }) => {
        const userId = session.user.id

        // Any member of the submitting lab may resubmit; researcherId stays the original creator
        // (OTTER-497).
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)
        const labScope = userLabOrgIds.length > 0 ? userLabOrgIds : ['']

        // Redundant with the UPDATE's guards; it exists to distinguish "not your lab" from
        // "already submitted (race)" for distinct messages. Don't delete it to "simplify".
        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['study.id as id', 'study.status as status', 'org.name as orgName'])
            .where('study.id', '=', studyId)
            .where('study.submittedByOrgId', 'in', labScope)
            .executeTakeFirst()

        if (!study) throw new ActionFailure({ submission: 'Study not found or access denied' })
        if (study.status !== 'CHANGE-REQUESTED') {
            throw new ActionFailure({ submission: 'This proposal can no longer be resubmitted.' })
        }

        if (countCharacters(studyInfo.title ?? '') > STUDY_TITLE_MAX_CHARACTERS) {
            throw new ActionFailure({ title: STUDY_TITLE_OVER_LIMIT_ERROR })
        }

        const updateValues = Object.fromEntries(
            proposalUpdatableFields.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        // First-resubmitter-wins: the status guard stops concurrent co-authors from double-inserting
        // a RESUBMISSION-NOTE row. submittedAt is deliberately not bumped; the comment row holds it.
        const resubmittedAt = new Date()
        const claimed = await db
            .updateTable('study')
            .set({
                ...updateValues,
                status: 'PENDING-REVIEW',
                proposalResubmissionNoteDraft: null,
                lastUpdatedAt: resubmittedAt,
            })
            .where('id', '=', studyId)
            .where('status', '=', 'CHANGE-REQUESTED')
            .where('submittedByOrgId', 'in', labScope)
            .returning(['id'])
            .executeTakeFirst()

        if (!claimed) {
            throw new ActionFailure({ submission: 'Proposal has already been submitted' })
        }

        await db
            .insertInto('studyProposalComment')
            .values({
                studyId,
                authorId: userId,
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                body: JSON.parse(resubmissionNoteToLexicalJson(resubmissionNote)),
                version: nextVersionForStudyComment({ studyId, increment: true }),
            })
            .execute()

        // The new round orphans the closed round's review-feedback rows; delete in-tx so a still
        // connected tab cannot re-create them via Hocuspocus persistence.
        await db
            .deleteFrom('yjsDocument')
            .where('studyId', '=', studyId)
            .where('name', 'like', `review-feedback-${studyId}%`)
            .execute()

        // A later reopen must re-seed from study columns, not stale pre-resubmit CRDT (OTTER-497).
        await db
            .deleteFrom('yjsDocument')
            .where('studyId', '=', studyId)
            .where('name', 'like', `proposal-${studyId}-%`)
            .execute()

        // Feeds the `proposal-submitted` broadcast; clerkId lets a client skip its own session.
        const submitter = await db
            .selectFrom('user')
            .select(['fullName', 'clerkId'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.dashboard)
        revalidatePath(Routes.orgDashboard({ orgSlug }))
        revalidatePath(Routes.studyReview({ orgSlug, studyId }))

        purgeProposalYjsDocsAfterFinalize({ studyId, beforeAt: resubmittedAt })
        onStudyProposalResubmitted({ studyId, userId })

        return {
            studyId,
            submitterFullName: submitter.fullName,
            submitterClerkId: submitter.clerkId,
            orgName: study.orgName,
        }
    })

export const saveProposalResubmissionNoteDraftAction = new Action('saveProposalResubmissionNoteDraftAction', {
    performsMutations: true,
})
    // Serialized Lexical JSON: heavy per-word formatting inflates a 300-word note (OTTER-658).
    .params(z.object({ studyId: z.uuid(), note: z.string().max(100_000) }))
    .middleware(withStudySubject)
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, note }, session }) => {
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        const editedAt = new Date()
        const saved = await db
            .updateTable('study')
            .set({ proposalResubmissionNoteDraft: note, labEditedAt: editedAt })
            .where('id', '=', studyId)
            .where('status', '=', 'CHANGE-REQUESTED')
            .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
            .returning(['id'])
            .executeTakeFirst()

        if (!saved) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }
        await markStudyOpened(db, { studyId, userId: session.user.id, seenAt: editedAt })

        return { studyId, savedAt: new Date().toISOString() }
    })
