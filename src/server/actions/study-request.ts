'use server'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { DB } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { pathForStudy, pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
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
import {
    codeSubmissionVersion,
    getInfoForStudyId,
    getOrgIdFromSlug,
    latestSubmittedJobForStudy,
} from '@/server/db/queries'
import { db as database } from '@/database'
import { deferred, onStudyReviewRequested, onStudyCodeSubmitted, onStudyCreated } from '@/server/events'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import logger from '@/lib/logger'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import { draftStudyApiSchema } from '@/app/[orgSlug]/study/request/form-schemas'
import {
    RESUBMIT_NOTE_MAX_WORDS,
    RESUBMIT_NOTE_MIN_WORDS,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { countWords, lexicalJson } from '@/lib/lexical'
import { canResubmitStudyCode } from '@/lib/code-resubmission'

const simulateJobScan = deferred(async (studyJobId: string) => {
    await sleep({ 1: 'seconds' })
    await database.insertInto('jobStatusChange').values({ studyJobId, status: 'CODE-SCANNED' }).execute()
})

// Safety-net delete: an in-tx DELETE inside finalizeStudySubmissionAction handles
// the common case, but a Hocuspocus debounced persist can still commit between
// the management-app status flip and our in-tx delete (different connections,
// READ COMMITTED snapshots). Wait long enough for any in-flight persist to land,
// then re-delete rows whose updatedAt predates the captured submit timestamp.
// The bound preserves rows from a fast PENDING-REVIEW -> CHANGE-REQUESTED ->
// reopen-and-edit cycle that lands inside the 5-second window.
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

/**
 * Attach the submitted code to the study's current submission round, reusing the job opened at IDE
 * launch / file upload instead of minting a new one (OTTER-601). A new job is created only after a
 * post-run results decision (FILES-APPROVED / FILES-REJECTED) closes the round; change-requested and
 * errored rounds reuse the same job (ROUND_CLOSING_JOB_STATUSES in code-resubmission.ts).
 *
 * The MAIN/SUPPLEMENTAL code file set is overwritten each time so a re-submit within an un-reviewed
 * round (or after change-requested) reflects exactly the files now provided, with no leftovers from a
 * prior attempt — in the DB and in S3.
 */
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
        // Reused round: drop any code files a prior attempt left on this job, in the DB and in S3,
        // so a removed file does not linger in the reviewer's view.
        await db
            .deleteFrom('studyJobFile')
            .where('studyJobId', '=', studyJobId)
            .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
            .execute()
        await deleteFolderContents(pathForStudyJobCode({ orgSlug, studyId, studyJobId }))
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

    // s3 signed url for client to upload
    const urlForCodeUpload = await createSignedUploadUrl(pathForStudyJobCode({ orgSlug, studyId, studyJobId }))

    return { studyJobId, urlForCodeUpload }
}

/**
 * Record CODE-SUBMITTED once per submission *round*. CODE-SUBMITTED is an append-only submission
 * event: each round (initial, and each resubmit after a CODE-CHANGES-REQUESTED) appends one, so the
 * status history is an honest log of how many times the code was submitted. The round-boundary fix
 * keeps a change-requested resubmit on the SAME job, so we can't dedup on "job already has a
 * CODE-SUBMITTED" — that would swallow the new round's submission and leave the researcher's /view
 * stuck on the feedback screen and the reviewer never re-notified.
 *
 * Round-aware idempotency (order-independent — same counting the liveness/version logic uses): the
 * current round is already submitted iff submitted-count > change-requested-count on this job. A
 * re-submit within the same un-reviewed round (submitted > requested) is a no-op; the first submit
 * of a round (submitted == requested) appends.
 */
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

// Schema for creating a new draft
const onSaveDraftStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    submittingOrgSlug: z.string(),
    studyInfo: draftStudyApiSchema,
})

export const onSaveDraftStudyAction = new Action('onSaveDraftStudyAction', { performsMutations: true })
    .params(onSaveDraftStudyActionArgsSchema)
    .middleware(async ({ params: { orgSlug } }) => await getOrgIdFromSlug({ orgSlug }))
    .requireAbilityTo('create', 'Study')
    .handler(async ({ db, params: { orgSlug, studyInfo, submittingOrgSlug }, session, orgId }) => {
        const userId = session.user.id
        const submittingLab = await getOrgIdFromSlug({ orgSlug: submittingOrgSlug })
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
                submittedByOrgId: submittingLab.orgId,
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

// Schema for updating an existing draft
const onUpdateDraftStudyActionArgsSchema = onSaveDraftStudyActionArgsSchema
    .omit({ orgSlug: true, submittingOrgSlug: true })
    .extend({ studyId: z.string() })

export const onUpdateDraftStudyAction = new Action('onUpdateDraftStudyAction', { performsMutations: true })
    .params(onUpdateDraftStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, orgSlug }) => {
        // Update study fields (only defined values)
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

        // Allow co-authoring within the submitting lab while the proposal is editable.
        // CASL `update Study` is org-type-scoped (any lab member); the row filter below
        // scopes to the submitting lab + editable status set, and we throw on a 0-row
        // result so a user outside the lab or operating on a post-submit study gets a
        // hard rejection instead of a misleading success with signed upload URLs.
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

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

// Submit a draft study - converts DRAFT to PENDING-REVIEW and creates study job
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

        // Verify the study is in DRAFT status before submitting
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

        // Attach the code to the study's current submission round. finalizeStudySubmissionAction
        // adds the CODE-SUBMITTED status to this same job, so the two no longer diverge.
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

// Finalize study submission after files are uploaded
// First-submit-wins + atomic snapshot: a single conditional UPDATE both writes the
// caller's field snapshot (when supplied) AND flips the status. This eliminates the
// race window where two concurrent submitters could each run a separate field-update
// before one of them flipped status, leaving the winner's row populated with the
// loser's stale snapshot.
const finalizeStudySubmissionInfoSchema = z
    .object({
        title: z.string().nullable().optional(),
        piName: z.string().optional(),
        piUserId: z.string().nullable().optional(),
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

        // CASL `update Study` is org-type-scoped (any lab member), so we additionally
        // require the caller to belong to the study's submitting lab. Without this,
        // a user in a different lab could finalize someone else's draft just by
        // knowing the studyId.
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

        // The atomic UPDATE above is the canonical post-submit snapshot. Drop the
        // proposal-* yjs_document rows so a future CHANGE-REQUESTED reopen falls
        // through to onLoadDocument's seeder (which reads from study columns)
        // rather than re-loading stale CRDT state from before the submit. The
        // deferred follow-up below catches any Hocuspocus debounce that lands
        // between commit time and now.
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

        // The round job created by onSubmitDraftStudyAction (id tiebreaker keeps this deterministic
        // when two jobs share a createdAt). Adding CODE-SUBMITTED here targets that same job.
        const latestJob = await db
            .selectFrom('studyJob')
            .select('studyJob.id as id')
            .where('studyJob.studyId', '=', studyId)
            .orderBy('studyJob.createdAt', 'desc')
            .orderBy('studyJob.id', 'desc')
            .limit(1)
            .executeTakeFirst()

        if (latestJob) {
            // Round-aware: appends a CODE-SUBMITTED for a new round, no-ops within an un-reviewed round.
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

// Fetch draft/proposal approved study data for editing
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
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, study }) => {
        // Get code files if they exist
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
    .requireAbilityTo('delete', 'Study') // will use orgId from above
    .handler(async ({ db, orgSlug, params: { studyId } }) => {
        const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
        if (jobs.length > 0) {
            const jobIds = jobs.map((job) => job.id)
            await db.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
        }
        await db.deleteFrom('study').where('id', '=', studyId).execute()
        // Clean up the files from s3
        await deleteFolderContents(pathForStudy({ orgSlug, studyId }))
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

// OTTER-521: Edit & resubmit proposal — researcher revises the initial request
// after the DO marked it 'needs clarification' (CHANGE-REQUESTED).
//
// The resubmission note is stored in the studyProposalComment table introduced
// by OTTER-501 (entryType=RESUBMISSION-NOTE, authorRole=RESEARCHER).
// Authorization is handled via CASL (requireAbilityTo('update', 'Study')) — we
// don't add a redundant `where researcherId = userId` filter.

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

const resubmissionNoteParam = z
    .string()
    .refine((val) => countWords(val) >= RESUBMIT_NOTE_MIN_WORDS, {
        message: 'A resubmission note is required.',
    })
    .refine((val) => countWords(val) <= RESUBMIT_NOTE_MAX_WORDS, {
        message: `Resubmission note must be ${RESUBMIT_NOTE_MAX_WORDS} words or fewer.`,
    })

// click). CASL `update Study` is org-type-scoped (any lab member), so we pair
// it with a `submittedByOrgId in <user's lab orgs>` filter to allow any
// researcher in the submitting lab to co-author the resubmission. The 0-row
// `executeTakeFirst()` check turns a cross-lab / wrong-status attempt into a
// hard ActionFailure instead of a silent no-op that the client would render
// as success. Mirrors onUpdateDraftStudyAction.
export const onUpdateClarifiedProposalAction = new Action('onUpdateClarifiedProposalAction', {
    performsMutations: true,
})
    .params(z.object({ studyId: z.string(), studyInfo: draftStudyApiSchema }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session }) => {
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)
        const labScope = userLabOrgIds.length > 0 ? userLabOrgIds : ['']

        const updateValues = Object.fromEntries(
            proposalUpdatableFields.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        const verified =
            Object.keys(updateValues).length > 0
                ? await db
                      .updateTable('study')
                      .set(updateValues)
                      .where('id', '=', studyId)
                      .where('status', '=', 'CHANGE-REQUESTED')
                      .where('submittedByOrgId', 'in', labScope)
                      .returning(['id'])
                      .executeTakeFirst()
                : await db
                      .selectFrom('study')
                      .select('id')
                      .where('id', '=', studyId)
                      .where('status', '=', 'CHANGE-REQUESTED')
                      .where('submittedByOrgId', 'in', labScope)
                      .executeTakeFirst()

        if (!verified) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }

        return { studyId }
    })

// Final resubmission: writes the latest proposal edits, records the
// resubmission note as a study_proposal_comment row, and transitions
// CHANGE-REQUESTED -> PENDING-REVIEW.
//
// `performsMutations: true` runs this handler inside db.transaction().
// Do not drop it: the study updates/inserts must commit or roll back together.
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

        // OTTER-497: resubmit is open to any member of the submitting lab (the
        // original creator stays recorded as researcherId). CASL `update Study`
        // is org-type-scoped, so the row filter below scopes to the submitting
        // lab, matching onUpdateDraftStudyAction / finalizeStudySubmissionAction.
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)
        const labScope = userLabOrgIds.length > 0 ? userLabOrgIds : ['']

        // This SELECT is not load-bearing for safety: the UPDATE below applies the
        // same status + lab guards and would claim 0 rows, caught by `if (!claimed)`.
        // It earns its place by splitting the diagnostics, distinguishing "not your
        // lab / doesn't exist" from "already submitted (race)" so each case gets a
        // distinct user-facing message. Don't delete it to "simplify".
        // org.name is fetched here (joined on the reviewing org, study.orgId) so the
        // `proposal-submitted` broadcast below can name the reviewing org in peers'
        // toast without a second round-trip.
        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['study.id as id', 'study.status as status', 'org.name as orgName'])
            .where('study.id', '=', studyId)
            .where('study.submittedByOrgId', 'in', labScope)
            .executeTakeFirst()

        // User-facing failures (wrong-lab access, wrong-status race) use ActionFailure
        // so the client receives a structured `{ error: { submission } }` it can show,
        // rather than a plain Error bubbling up as a generic unhandled exception.
        if (!study) throw new ActionFailure({ submission: 'Study not found or access denied' })
        if (study.status !== 'CHANGE-REQUESTED') {
            throw new ActionFailure({ submission: 'This proposal can no longer be resubmitted.' })
        }

        const updateValues = Object.fromEntries(
            proposalUpdatableFields.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        // First-resubmitter-wins via atomic conditional UPDATE: bundling the
        // status flip and the note-draft clear in one UPDATE with a status
        // guard means two concurrent co-authors clicking Resubmit can't both
        // win the SELECT/UPDATE race and double-insert a RESUBMISSION-NOTE
        // row. The loser hits the 0-row branch and fails before the comment
        // insert below runs. submittedAt is intentionally NOT bumped — the
        // original first-submission timestamp is preserved; the
        // studyProposalComment row carries the resubmission timestamp.
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
                body: JSON.parse(lexicalJson(resubmissionNote)),
                version: nextVersionForStudyComment({ studyId, increment: true }),
            })
            .execute()

        // The bumped version above opens a new review round. Any `review-feedback-*`
        // yjs_document row from the closed round is now orphaned: round N+1 binds
        // to a fresh `…-v<n+1>` room. A stale `…-v<n>` tab still connected when
        // the status flipped back to PENDING-REVIEW could otherwise re-create the
        // deleted row via Hocuspocus persistence. Mirrors the same-tx delete in
        // submitProposalReviewAction.
        await db
            .deleteFrom('yjsDocument')
            .where('studyId', '=', studyId)
            .where('name', 'like', `review-feedback-${studyId}%`)
            .execute()

        // OTTER-497: change-requested editing is collaborative, so drop the
        // proposal-* yjs_document rows on resubmit for the same reason
        // finalizeStudySubmissionAction does — a future CHANGE-REQUESTED reopen
        // should fall through to onLoadDocument's seeder (study columns) instead
        // of re-loading stale CRDT from before this resubmit. The deferred purge
        // catches any Hocuspocus debounce landing after commit.
        await db
            .deleteFrom('yjsDocument')
            .where('studyId', '=', studyId)
            .where('name', 'like', `proposal-${studyId}-%`)
            .execute()

        // Metadata for the `proposal-submitted` stateless broadcast: peers still
        // editing get a toast naming the submitter, and the client uses clerkId to
        // identify the submitter's own session. Mirrors finalizeStudySubmissionAction.
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

// OTTER-558: Save the in-progress resubmission note as a lab-shared draft. Any
// researcher in the submitting lab can edit; last write wins (no merge / CRDT).
// Cleared by resubmitStudyCodeAction when the note is finalized.
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

        // Code resubmission runs while study.status stays APPROVED (the reviewer's
        // CODE-CHANGES-REQUESTED / results decision lives on the job, not the study),
        // so eligibility is gated on the latest *submitted* job — exactly as the
        // resubmit page and resubmitStudyCodeAction do — not on study.status. Guarding
        // on study.status = 'CHANGE-REQUESTED' here (a proposal-clarification status)
        // would make this autosave throw on every keystroke during a code resubmit.
        const latestJob = await latestSubmittedJobForStudy(studyId)
        const latestStatus = latestJob?.statusChanges.at(0)?.status
        if (!canResubmitStudyCode(latestStatus)) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }

        // The lab guard stops a cross-lab member from writing a draft onto another
        // lab's study, and the 0-row check turns a wrong-lab attempt into a hard
        // ActionFailure instead of letting the client's autosave indicator report
        // "saved" when nothing persisted.
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

// Save the in-progress proposal resubmission note as a lab-shared draft.
// Mirrors saveCodeResubmissionNoteDraftAction — last write wins, lab-scoped
// via the `submittedByOrgId in <user's lab orgs>` guard so a co-author in the
// same lab sees the latest draft. Cleared by resubmitProposalAction when the
// note is finalized into a studyProposalComment. The 0-row check turns a
// cross-lab / wrong-status attempt into a hard ActionFailure — otherwise the
// client would render the autosave indicator as "All changes saved" while the
// note was never persisted.
export const saveProposalResubmissionNoteDraftAction = new Action('saveProposalResubmissionNoteDraftAction', {
    performsMutations: true,
})
    .params(z.object({ studyId: z.string().uuid(), note: z.string().max(10_000) }))
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

// OTTER-558: Finalize the code resubmission. Creates a new study_job (mirroring
// submitStudyCodeAction's flow), copies the coder workspace files to S3,
// records the resubmission note on the job row, clears the draft on study,
// and triggers the scan + review-requested events. The study's proposal-stage
// status is untouched; the new CODE-SUBMITTED job status drives the review phase.
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

        // Gate on the latest *submitted* job, not the raw latest: a file upload during resubmit opens
        // a fresh INITIATED round job that would otherwise mask the prior submission and fail this
        // guard (OTTER-601). The prior submission's status is what determines resubmit eligibility.
        const latestJob = await latestSubmittedJobForStudy(studyId)
        const latestStatus = latestJob?.statusChanges.at(0)?.status
        if (!canResubmitStudyCode(latestStatus)) {
            throw new Error(`Cannot resubmit study code: latest job status is ${latestStatus ?? 'none'}`)
        }

        if (fileNames.length === 0) throw new Error('No files provided')
        if (!fileNames.includes(mainFileName)) throw new Error('Main file not in file list')

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        // attachCodeToRoundJob → getOrCreateCurrentRoundJob decides reuse-vs-new-round by whether the
        // round has CLOSED (FILES-APPROVED/FILES-REJECTED only). A CODE-CHANGES-REQUESTED resubmit
        // revises IN PLACE (same job, overwritten files, a new CODE-SUBMITTED); a resubmit after a
        // post-run results decision opens a genuinely new round job.
        const { studyJobId } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) coderFilesPath += `/${studyId}`
        // Mirrors submitStudyCodeAction: these copies run inside the Action
        // transaction, so a later rollback can leave orphaned S3 objects.
        for (const fileName of fileNames) {
            const sanitized = sanitizeFileName(fileName)
            const filePath = path.join(coderFilesPath, sanitized)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, sanitized)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await markCodeSubmitted(db, { studyJobId, userId })

        // Record the round this note opened (the study-wide submission version) so the reviewer's
        // feedback panel labels the note and that round's decision with the same version (OTTER-638).
        const resubmissionRound = await codeSubmissionVersion(studyId, db)

        await db
            .updateTable('studyJob')
            .set({ resubmissionNote: JSON.parse(lexicalJson(resubmissionNote)), resubmissionRound })
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
