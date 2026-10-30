'use server'

import { DB } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { countCharacters } from '@/lib/field-limits'
import { Routes } from '@/lib/routes'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { withStudyAccessSubject, withStudySubject } from '@/server/actions/study-subject'
import { codeBuildRepositoryUrl } from '@/server/aws'
import { codeRoundForJob } from '@/server/db/code-round'
import { markStudyOpened } from '@/server/db/mutations'
import { fetchUserFullName, findOrgIdBySlug, selectCodeEnvSnapshot } from '@/server/db/queries'
import { onStudyDraftCreated, onStudyProposalSubmitted, onStudyReviewRequested } from '@/server/events'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import {
    STUDY_TITLE_BLANK_ERROR,
    STUDY_TITLE_MAX_CHARACTERS,
    STUDY_TITLE_OVER_LIMIT_ERROR,
    draftStudyApiSchema,
} from '@/schema/study-request'
import { isDesignatedTestLab } from '@/server/db/test-lab'
import { markCodeSubmitted, purgeProposalYjsDocsAfterFinalize, triggerCodeScan } from '@/server/study-submission'

// Frozen so a Data Partner editing or replacing a code env later cannot change what the study runs:
// its image, command lines, variables and data paths all come from this copy.
async function snapshotCodeEnv(db: Kysely<DB>, studyId: string) {
    const codeEnv = await selectCodeEnvSnapshot(db, studyId).executeTakeFirst()
    await db
        .updateTable('study')
        .set({ codeEnvSnapshot: codeEnv ?? null })
        .where('id', '=', studyId)
        .execute()
}

const onSaveDraftStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    submittingOrgSlug: z.string(),
    studyInfo: draftStudyApiSchema,
})

export const onSaveDraftStudyAction = new Action('onSaveDraftStudyAction', { performsMutations: true })
    .params(onSaveDraftStudyActionArgsSchema)
    // Resolving here puts submittedByOrgId in the ability subject, so `create Study` enforces lab
    // membership via CASL — otherwise a caller could stamp another lab's id on a study (OTTER-719).
    .middleware(async ({ db, params: { orgSlug, submittingOrgSlug } }) => ({
        ...(await findOrgIdBySlug(db, orgSlug, true)),
        submittedByOrgId: (await findOrgIdBySlug(db, submittingOrgSlug, true)).orgId,
    }))
    .requireAbilityTo('create', 'Study')
    .handler(async ({ db, params: { orgSlug, studyInfo }, session, orgId, submittedByOrgId }) => {
        const titleLength = countCharacters(studyInfo.title ?? '')

        if (titleLength > STUDY_TITLE_MAX_CHARACTERS) {
            throw new ActionFailure({ title: STUDY_TITLE_OVER_LIMIT_ERROR })
        }

        // Not in draftStudyApiSchema: that schema is shared with update/resubmit, whose titles
        // are owned elsewhere (OTTER-690).
        if (titleLength === 0) {
            throw new ActionFailure({ title: STUDY_TITLE_BLANK_ERROR })
        }

        const userId = session.user.id
        const studyId = uuidv7()
        const containerLocation = await codeBuildRepositoryUrl({ studyId, orgSlug })

        // Sole writer of the column. Stamped, not derived: a designation applies to studies made
        // from then on, so deriving it would extend a new one backwards over existing studies.
        const isTestStudy = await isDesignatedTestLab(db, { dataPartnerId: orgId, researchLabId: submittedByOrgId })

        await db
            .insertInto('study')
            .values({
                id: studyId,
                title: studyInfo.title?.trim() || null,
                piName: studyInfo.piName || '',
                piUserId: studyInfo.piUserId || null,
                language: studyInfo.language,
                descriptionDocPath: studyInfo.descriptionDocPath || null,
                irbDocPath: studyInfo.irbDocPath || null,
                agreementDocPath: studyInfo.agreementDocPath || null,
                orgId,
                researcherId: userId,
                submittedByOrgId,
                containerLocation,
                isTestStudy,
                status: 'DRAFT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await snapshotCodeEnv(db, studyId)
        await markStudyOpened(db, { studyId, userId, seenAt: new Date() })
        onStudyDraftCreated({ studyId, userId })

        return { studyId }
    })

// Deliberately permissive on title: this schema also serves the CHANGE-REQUESTED resubmit
// autosave, and a study predating OTTER-690 can hold an over-cap title, so a cap in `.params()`
// would fail every autosave. The handler applies the cap where the status makes it meaningful.
const onUpdateDraftStudyActionArgsSchema = z.object({
    studyId: z.string(),
    studyInfo: draftStudyApiSchema,
})

export const onUpdateDraftStudyAction = new Action('onUpdateDraftStudyAction', { performsMutations: true })
    .params(onUpdateDraftStudyActionArgsSchema)
    .middleware(withStudySubject)
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, status, submittedByOrgId }) => {
        // The row filter below repeats CASL's lab scope so a caller holding a broader grant
        // (`manage all`) is hard-rejected rather than allowed to update the study.
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        // DRAFT only: a CHANGE-REQUESTED title may predate the cap, so that flow is capped at
        // resubmitProposalAction instead (OTTER-737).
        if (
            userLabOrgIds.includes(submittedByOrgId) &&
            status === 'DRAFT' &&
            countCharacters(studyInfo.title ?? '') > STUDY_TITLE_MAX_CHARACTERS
        ) {
            throw new ActionFailure({ title: STUDY_TITLE_OVER_LIMIT_ERROR })
        }

        const updatable = [
            'title',
            'piName',
            'piUserId',
            'language',
            'descriptionDocPath',
            'irbDocPath',
            'agreementDocPath',
            'datasets',
            'researchQuestions',
            'projectSummary',
            'impact',
            'additionalNotes',
        ] as const
        const updateValues = Object.fromEntries(
            updatable.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        const before = await db.selectFrom('study').select('language').where('id', '=', studyId).executeTakeFirst()

        const editedAt = new Date()
        const verified =
            Object.keys(updateValues).length > 0
                ? await db
                      .updateTable('study')
                      .set({ ...updateValues, labEditedAt: editedAt })
                      .where('id', '=', studyId)
                      .where('status', 'in', ['DRAFT', 'CHANGE-REQUESTED'])
                      .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
                      .returning(['id'])
                      .executeTakeFirst()
                : await db
                      .selectFrom('study')
                      .select('id')
                      .where('id', '=', studyId)
                      .where('status', 'in', ['DRAFT', 'CHANGE-REQUESTED'])
                      .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
                      .executeTakeFirst()

        if (!verified) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }
        // A person's own save must not mark the study unread for them (OTTER-838).
        await markStudyOpened(db, { studyId, userId: session.user.id, seenAt: editedAt })

        // Autosave resends the language every time, so only an actual change may replace the snapshot.
        if (studyInfo.language !== undefined && studyInfo.language !== before?.language) {
            await snapshotCodeEnv(db, studyId)
        }

        return { studyId }
    })

const finalizeStudySubmissionInfoSchema = z
    .object({
        title: z.string().nullable().optional(),
        piName: z.string().optional(),
        // No field displays this, so submit is the only enforcement point (OTTER-647).
        piUserId: z.uuid().nullable().optional(),
        datasets: z.array(z.string()).optional(),
        researchQuestions: z.string().optional(),
        projectSummary: z.string().optional(),
        impact: z.string().optional(),
        additionalNotes: z.string().optional(),
    })
    .partial()

export const finalizeStudySubmissionAction = new Action('finalizeStudySubmissionAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), studyInfo: finalizeStudySubmissionInfoSchema.optional() }))
    .middleware(withStudySubject)
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, orgSlug, status, afterCommit }) => {
        const userId = session.user.id

        // Repeated on the claiming UPDATE below so a caller holding a broader grant (`manage all`)
        // cannot finalize someone else's draft by knowing the studyId.
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        const snapshotFields: Record<string, unknown> = {}
        if (studyInfo) {
            const updatable = [
                'title',
                'piName',
                'piUserId',
                'datasets',
                'researchQuestions',
                'projectSummary',
                'impact',
                'additionalNotes',
            ] as const
            for (const key of updatable) {
                if (studyInfo[key] !== undefined) snapshotFields[key] = studyInfo[key]
            }
        }

        // Read here, after the check, rather than widening the shared study subject.
        const submittedTitle =
            'title' in snapshotFields
                ? (snapshotFields.title as string | null)
                : ((await db.selectFrom('study').select('title').where('id', '=', studyId).executeTakeFirst())?.title ??
                  null)

        if (!submittedTitle?.trim()) {
            throw new ActionFailure({ title: STUDY_TITLE_BLANK_ERROR })
        }

        if (countCharacters(submittedTitle) > STUDY_TITLE_MAX_CHARACTERS) {
            throw new ActionFailure({ title: STUDY_TITLE_OVER_LIMIT_ERROR })
        }

        const submittedAt = new Date()
        // The field snapshot and the status flip ride one conditional UPDATE on purpose: as two
        // statements, concurrent submitters could each write fields before either flips status,
        // leaving the winner's row holding the loser's stale snapshot.
        const claimed = await db
            .updateTable('study')
            .set({ ...snapshotFields, status: 'PENDING-REVIEW', submittedAt, lastUpdatedAt: submittedAt })
            .where('id', '=', studyId)
            .where('status', 'in', ['DRAFT', 'CHANGE-REQUESTED'])
            .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
            .returning(['id', 'submittedByOrgId'])
            .executeTakeFirst()

        if (!claimed) {
            throw new ActionFailure({ submission: 'Proposal has already been submitted' })
        }

        // A later CHANGE-REQUESTED reopen must re-seed from study columns, not stale pre-submit CRDT.
        await db
            .deleteFrom('yjsDocument')
            .where('studyId', '=', studyId)
            .where('name', 'like', `proposal-${studyId}-%`)
            .execute()

        const submitterFullName = await fetchUserFullName(userId, db)

        const reviewerOrg = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['org.name as orgName'])
            .where('study.id', '=', studyId)
            .executeTakeFirstOrThrow()

        // id tiebreaker keeps this deterministic when two jobs share a createdAt.
        const latestJob = await db
            .selectFrom('studyJob')
            .select('studyJob.id as id')
            .where('studyJob.studyId', '=', studyId)
            .orderBy('studyJob.createdAt', 'desc')
            .orderBy('studyJob.id', 'desc')
            .limit(1)
            .executeTakeFirst()

        if (latestJob) {
            await markCodeSubmitted(db, { studyJobId: latestJob.id, userId })
            // Read after the CODE-SUBMITTED row and inside its transaction, so it names the round
            // this code belongs to. A result that arrives after the next round opens is discarded
            // against it rather than shown as current (OTTER-779).
            const round = await codeRoundForJob(latestJob.id, db)
            triggerCodeScan(latestJob.id, orgSlug, studyId, round)
            afterCommit(() => onStudyReviewRequested({ studyJobId: latestJob.id, round }))
        }

        await markStudyOpened(db, { studyId, userId, seenAt: submittedAt })

        onStudyProposalSubmitted({ userId, studyId, isResubmission: status === 'CHANGE-REQUESTED' })

        revalidatePath(Routes.orgDashboard({ orgSlug }))

        purgeProposalYjsDocsAfterFinalize({ studyId, beforeAt: submittedAt })

        return {
            studyId,
            submitterFullName,
            orgName: reviewerOrg.orgName,
        }
    })

export const getDraftStudyAction = new Action('getDraftStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .innerJoin('user', 'user.id', 'study.researcherId')
            .select([
                'study.id',
                'study.title',
                'study.piName',
                'study.piUserId',
                'study.language',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.status',
                'study.isTestStudy',
                'study.researcherId',
                'study.orgId',
                'study.submittedByOrgId',
                'study.researchQuestions',
                'study.projectSummary',
                'study.impact',
                'study.additionalNotes',
                'study.datasets',
                'org.slug as orgSlug',
                'org.name as orgName',
                'submittingOrg.slug as submittedByOrgSlug',
                'submittingOrg.name as submittingLabName',
                'user.fullName as researcherName',
            ])
            .where('study.id', '=', studyId)
            .where('study.status', 'in', ['DRAFT', 'CHANGE-REQUESTED', 'APPROVED'])
            .executeTakeFirstOrThrow(throwNotFound('Draft study'))

        const studyJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', study.id)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        let codeFiles: { name: string; fileType: string }[] = []
        if (studyJob) {
            codeFiles = await db
                .selectFrom('studyJobFile')
                .select(['name', 'fileType'])
                .where('studyJobId', '=', studyJob.id)
                .execute()
        }

        return {
            ...study,
            mainCodeFileName: codeFiles.find((f) => f.fileType === 'MAIN-CODE')?.name,
            additionalCodeFileNames: codeFiles.filter((f) => f.fileType === 'SUPPLEMENTAL-CODE').map((f) => f.name),
        }
    })
