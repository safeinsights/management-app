'use server'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { DB } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { countCharacters, overCharacterLimitError } from '@/lib/field-limits'
import { pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { sanitizeFileName, sleep } from '@/lib/utils'
import { Action, ActionFailure, z } from '@/server/actions/action'
import {
    codeBuildRepositoryUrl,
    deleteFolderContents,
    createSignedUploadUrl,
    storeS3File,
    triggerScanForStudyJob,
} from '@/server/aws'
import { CODER_DISABLED, getConfigValue, SIMULATE_CODE_BUILD } from '@/server/config'
import { getOrCreateCurrentRoundJob, nextVersionForStudyComment } from '@/server/db/mutations'
import { codeSubmissionVersion, getInfoForStudyId, getOrgIdFromSlug } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { db as database } from '@/database'
import { deferred, onStudyReviewRequested, onStudyCodeSubmitted, onStudyCreated } from '@/server/events'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import { deleteStudyCompletely } from '@/server/qa-cleanup'
import logger from '@/lib/logger'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import {
    STUDY_TITLE_BLANK_ERROR,
    STUDY_TITLE_MAX_CHARACTERS,
    STUDY_TITLE_OVER_LIMIT_ERROR,
    draftStudyApiSchema,
} from '@/app/[orgSlug]/study/request/form-schemas'
import {
    RESUBMIT_NOTE_FIELD_TITLE,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    resubmissionNoteToLexicalJson,
    resubmissionNoteCharacterCount,
    resubmissionNoteIsBlank,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { canResearcherResubmitCode, projectStudyState } from '@/lib/study-screen'

const simulateJobScan = deferred(async (studyJobId: string) => {
    await sleep({ 1: 'seconds' })
    await database.insertInto('jobStatusChange').values({ studyJobId, status: 'CODE-SCANNED' }).execute()
})

// A Hocuspocus persist can commit after the in-tx delete; re-delete rows
// older than the captured submit timestamp.
const purgeProposalYjsDocsAfterFinalize = deferred(async (args: { studyId: string; beforeAt: Date }) => {
    await sleep({ 5: 'seconds' })
    await purgeProposalYjsDocsBeforeAt(database, args)
})

function triggerCodeScan(studyJobId: string, orgSlug: string, studyId: string) {
    if (SIMULATE_CODE_BUILD) {
        simulateJobScan(studyJobId)
    } else {
        triggerScanForStudyJob({ studyJobId, orgSlug, studyId }).catch((err) =>
            logger.error('Failed to trigger code scan', err, { studyJobId }),
        )
    }
}

// Reuses the job opened at IDE launch rather than minting a new one (OTTER-601).
async function attachCodeToRoundJob(
    db: Kysely<DB>,
    studyId: string,
    orgSlug: string,
    mainCodeFileName: string,
    codeFileNames: string[],
) {
    const job = await getOrCreateCurrentRoundJob(db, studyId)
    const studyJobId = job.id

    if (!job.created) {
        await db
            .deleteFrom('studyJobFile')
            .where('studyJobId', '=', studyJobId)
            .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
            .execute()
        await deleteFolderContents(pathForStudyJobCode({ orgSlug, studyId, studyJobId }))
        // Otherwise generateAndStoreStudyReview short-circuits and keeps the stale
        // summary for the resubmitted code (SHRMP-263).
        await db.deleteFrom('studyReview').where('studyJobId', '=', studyJobId).execute()
    }

    await db
        .insertInto('studyJobFile')
        .values({
            name: mainCodeFileName,
            path: pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, mainCodeFileName),
            studyJobId,
            fileType: 'MAIN-CODE',
        })
        .executeTakeFirstOrThrow()

    for (const fileName of codeFileNames) {
        await db
            .insertInto('studyJobFile')
            .values({
                name: fileName,
                path: pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, fileName),
                studyJobId,
                fileType: 'SUPPLEMENTAL-CODE',
            })
            .executeTakeFirstOrThrow()
    }

    const urlForCodeUpload = await createSignedUploadUrl(pathForStudyJobCode({ orgSlug, studyId, studyJobId }))

    return { studyJobId, urlForCodeUpload }
}

// Once per submission round, not per job: a change-requested resubmit stays on the same job,
// so the round is already submitted iff submitted-count > change-requested-count.
async function markCodeSubmitted(db: Kysely<DB>, { studyJobId, userId }: { studyJobId: string; userId: string }) {
    const counts = await db
        .selectFrom('jobStatusChange')
        .select((eb) => [
            eb.fn.count<number>('id').filterWhere('status', '=', 'CODE-SUBMITTED').as('submitted'),
            eb.fn.count<number>('id').filterWhere('status', '=', 'CODE-CHANGES-REQUESTED').as('requested'),
        ])
        .where('studyJobId', '=', studyJobId)
        .executeTakeFirstOrThrow()

    const currentRoundAlreadySubmitted = Number(counts.submitted) > Number(counts.requested)
    if (currentRoundAlreadySubmitted) return
    await db.insertInto('jobStatusChange').values({ studyJobId, userId, status: 'CODE-SUBMITTED' }).execute()
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
    .middleware(async ({ params: { orgSlug, submittingOrgSlug } }) => ({
        ...(await getOrgIdFromSlug({ orgSlug })),
        submittedByOrgId: (await getOrgIdFromSlug({ orgSlug: submittingOrgSlug })).orgId,
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
                status: 'DRAFT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        return {
            studyId,
            urlForAgreementUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            ),
        }
    })

const onUpdateDraftStudyActionArgsSchema = z.object({
    studyId: z.string(),
    studyInfo: draftStudyApiSchema,
})

export const onUpdateDraftStudyAction = new Action('onUpdateDraftStudyAction', { performsMutations: true })
    .params(onUpdateDraftStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, orgSlug, status, submittedByOrgId }) => {
        // The row filter below repeats CASL's lab scope so a caller holding a broader grant
        // (`manage all`) is hard-rejected rather than handed signed upload URLs.
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

        const verified =
            Object.keys(updateValues).length > 0
                ? await db
                      .updateTable('study')
                      .set(updateValues)
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

        return {
            studyId,
            urlForAgreementUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            ),
        }
    })

const onSubmitDraftStudyActionArgsSchema = z.object({
    studyId: z.string(),
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const onSubmitDraftStudyAction = new Action('onSubmitDraftStudyAction', { performsMutations: true })
    .params(onSubmitDraftStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, mainCodeFileName, codeFileNames }, session, orgSlug }) => {
        const userId = session.user.id

        const study = await db
            .selectFrom('study')
            .select(['id', 'status'])
            .where('id', '=', studyId)
            .where('researcherId', '=', userId)
            .executeTakeFirst()

        if (!study) {
            throw new Error('Study not found or access denied')
        }

        if (study.status !== 'DRAFT' && study.status !== 'APPROVED') {
            throw new Error(`Cannot submit study: expected status DRAFT or APPROVED but got ${study.status}`)
        }

        const { studyJobId, urlForCodeUpload } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            mainCodeFileName,
            codeFileNames,
        )

        return {
            studyId,
            studyJobId,
            urlForCodeUpload,
        }
    })

const finalizeStudySubmissionInfoSchema = z
    .object({
        title: z.string().nullable().optional(),
        piName: z.string().optional(),
        // No field displays this, so submit is the only enforcement point (OTTER-647).
        piUserId: z.string().uuid().nullable().optional(),
        datasets: z.array(z.string()).optional(),
        researchQuestions: z.string().optional(),
        projectSummary: z.string().optional(),
        impact: z.string().optional(),
        additionalNotes: z.string().optional(),
    })
    .partial()

export const finalizeStudySubmissionAction = new Action('finalizeStudySubmissionAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), studyInfo: finalizeStudySubmissionInfoSchema.optional() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, orgSlug }) => {
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

        // Kept out of the middleware: that output is serialized into permission_denied and would
        // leak the title to anyone who guessed a study id (OTTER-724 / MA-6).
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

        const submitter = await db
            .selectFrom('user')
            .select(['fullName'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

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
            triggerCodeScan(latestJob.id, orgSlug, studyId)
            onStudyReviewRequested({ studyJobId: latestJob.id })
        }

        onStudyCreated({ userId, studyId })

        revalidatePath(`/${orgSlug}/dashboard`)

        purgeProposalYjsDocsAfterFinalize({ studyId, beforeAt: submittedAt })

        return {
            studyId,
            submitterFullName: submitter.fullName,
            orgName: reviewerOrg.orgName,
        }
    })

export const getDraftStudyAction = new Action('getDraftStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ db, params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
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
                'user.fullName as researcherName',
            ])
            .where('study.id', '=', studyId)
            .where('study.status', 'in', ['DRAFT', 'CHANGE-REQUESTED', 'APPROVED'])
            .executeTakeFirstOrThrow(throwNotFound('Draft study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, study }) => {
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

export const onDeleteStudyAction = new Action('onDeleteStudyAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('delete', 'Study')
    .handler(async ({ db, orgSlug, params: { studyId } }) => {
        await deleteStudyCompletely(db, orgSlug, studyId)
    })

export const submitStudyCodeAction = new Action('submitStudyCodeAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), mainFileName: z.string(), fileNames: z.array(z.string()) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'StudyJob')
    .handler(async ({ orgSlug, params: { studyId, mainFileName, fileNames }, session, db, status }) => {
        if (fileNames.length === 0) {
            throw new Error('No files provided')
        }

        if (!fileNames.includes(mainFileName)) {
            throw new Error('Main file not in file list')
        }

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        const { studyJobId } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) {
            coderFilesPath += `/${studyId}`
        }

        for (const fileName of fileNames) {
            const sanitizedName = sanitizeFileName(fileName)
            const filePath = path.join(coderFilesPath, sanitizedName)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, sanitizedName)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await markCodeSubmitted(db, { studyJobId, userId })

        await db.updateTable('study').set({ lastUpdatedAt: new Date() }).where('id', '=', studyId).execute()

        if (status === 'APPROVED') {
            onStudyCodeSubmitted({ userId, studyId })
        } else {
            onStudyCreated({ userId, studyId })
        }

        onStudyReviewRequested({ studyJobId })

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        triggerCodeScan(studyJobId, orgSlug, studyId)

        return { studyJobId }
    })

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

// Mirrors resubmitNoteSchema: the proposal flow submits Lexical JSON, the code flow plain text.
const resubmissionNoteParam = z
    .string()
    .refine((val) => !resubmissionNoteIsBlank(val), {
        message: 'A resubmission note is required.',
    })
    .refine((val) => resubmissionNoteCharacterCount(val) <= RESUBMIT_NOTE_MAX_CHARACTERS, {
        message: overCharacterLimitError(RESUBMIT_NOTE_FIELD_TITLE, RESUBMIT_NOTE_MAX_CHARACTERS),
    })

export const resubmitProposalAction = new Action('resubmitProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            studyInfo: draftStudyApiSchema,
            resubmissionNote: resubmissionNoteParam,
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
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

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/dashboard`)
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        purgeProposalYjsDocsAfterFinalize({ studyId, beforeAt: resubmittedAt })

        return {
            studyId,
            submitterFullName: submitter.fullName,
            submitterClerkId: submitter.clerkId,
            orgName: study.orgName,
        }
    })

// Lab-shared draft note; last write wins, no CRDT merge (OTTER-558).
export const saveCodeResubmissionNoteDraftAction = new Action('saveCodeResubmissionNoteDraftAction', {
    performsMutations: true,
})
    .params(z.object({ studyId: z.string().uuid(), note: z.string().max(10_000) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, note }, session }) => {
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        // study.status stays APPROVED during code resubmission; the decision lives on the job, so
        // eligibility comes from the same projected state the resubmit page renders from.
        const raw = await rawStudyStateForStudy(studyId, db)
        if (!raw || !canResearcherResubmitCode(projectStudyState(raw))) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }

        // The 0-row check turns a cross-lab attempt into a hard failure instead of letting the
        // client's autosave indicator report "saved" when nothing persisted.
        const saved = await db
            .updateTable('study')
            .set({ codeResubmissionNoteDraft: note })
            .where('id', '=', studyId)
            .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
            .returning(['id'])
            .executeTakeFirst()

        if (!saved) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }

        return { studyId, savedAt: new Date().toISOString() }
    })

export const saveProposalResubmissionNoteDraftAction = new Action('saveProposalResubmissionNoteDraftAction', {
    performsMutations: true,
})
    // Serialized Lexical JSON: heavy per-word formatting inflates a 300-word note (OTTER-658).
    .params(z.object({ studyId: z.string().uuid(), note: z.string().max(100_000) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, note }, session }) => {
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        const saved = await db
            .updateTable('study')
            .set({ proposalResubmissionNoteDraft: note })
            .where('id', '=', studyId)
            .where('status', '=', 'CHANGE-REQUESTED')
            .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
            .returning(['id'])
            .executeTakeFirst()

        if (!saved) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }

        return { studyId, savedAt: new Date().toISOString() }
    })

export const resubmitStudyCodeAction = new Action('resubmitStudyCodeAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string().uuid(),
            mainFileName: z.string(),
            fileNames: z.array(z.string()),
            resubmissionNote: resubmissionNoteParam,
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'StudyJob')
    .handler(async ({ orgSlug, params, session, db }) => {
        const { studyId, mainFileName, fileNames, resubmissionNote } = params

        const raw = await rawStudyStateForStudy(studyId, db)
        if (!raw || !canResearcherResubmitCode(projectStudyState(raw))) {
            throw new Error('Cannot resubmit study code: study is not in a resubmittable state')
        }

        if (fileNames.length === 0) throw new Error('No files provided')
        if (!fileNames.includes(mainFileName)) throw new Error('Main file not in file list')

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        const { studyJobId } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) coderFilesPath += `/${studyId}`
        // Runs inside the Action transaction, so a later rollback can leave orphaned S3 objects.
        for (const fileName of fileNames) {
            const sanitized = sanitizeFileName(fileName)
            const filePath = path.join(coderFilesPath, sanitized)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, sanitized)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await markCodeSubmitted(db, { studyJobId, userId })

        // Lets the reviewer's feedback panel label note and decision with the same version
        // (OTTER-638).
        const resubmissionRound = await codeSubmissionVersion(studyId, db)

        await db
            .updateTable('studyJob')
            .set({ resubmissionNote: JSON.parse(resubmissionNoteToLexicalJson(resubmissionNote)), resubmissionRound })
            .where('id', '=', studyJobId)
            .execute()

        await db
            .updateTable('study')
            .set({ lastUpdatedAt: new Date(), codeResubmissionNoteDraft: null })
            .where('id', '=', studyId)
            .execute()

        onStudyCodeSubmitted({ userId, studyId })
        onStudyReviewRequested({ studyJobId })

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        triggerCodeScan(studyJobId, orgSlug, studyId)

        return { studyJobId }
    })
