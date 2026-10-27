'use server'

import { getStudyFilesPath } from '@/server/workspace-files'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { isPgUniqueViolation } from '@/lib/errors'
import { pathForStudyJobCodeFile } from '@/lib/paths'
import { Routes } from '@/lib/routes'
import { sanitizeFileName } from '@/lib/utils'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { withStudySubject } from '@/server/actions/study-subject'
import { storeS3File } from '@/server/aws'
import { codeRoundForJob } from '@/server/db/code-round'
import { markStudyOpened } from '@/server/db/mutations'
import { codeSubmissionVersion } from '@/server/db/queries'
import { onStudyCodeSubmitted, onStudyProposalSubmitted, onStudyReviewRequested } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { resubmissionNoteToLexicalJson, resubmissionNoteParam } from '@/schema/resubmission-note'
import { requireStudyAgreement } from '@/server/study-agreement'
import { requireOpenedCodeRound, requireResubmittableCode, requireUnsubmittedCodeRound } from '@/server/study-code-gate'
import {
    attachCodeToRoundJob,
    markCodeSubmitted,
    sweepDiscardedScanLogs,
    triggerCodeScan,
} from '@/server/study-submission'

export const submitStudyCodeAction = new Action('submitStudyCodeAction', { performsMutations: true })
    .params(z.object({ studyId: z.uuid(), mainFileName: z.string(), fileNames: z.array(z.string()) }))
    .middleware(withStudySubject)
    .requireAbilityTo('create', 'StudyJob')
    .middleware(requireStudyAgreement(({ params }) => params.studyId))
    // The confirmation modal promises no changes after submitting, so the round's one submission is
    // enforced here rather than left to markCodeSubmitted, which swallowed a second one (OTTER-693).
    // A resubmission goes through resubmitStudyCodeAction, which requires a resubmission note.
    .middleware(requireUnsubmittedCodeRound(({ params }) => params.studyId))
    .middleware(requireOpenedCodeRound(({ params }) => params.studyId))
    .handler(async ({ orgSlug, params: { studyId, mainFileName, fileNames }, session, db, status, afterCommit }) => {
        if (fileNames.length === 0) {
            throw new Error('No files provided')
        }

        if (!fileNames.includes(mainFileName)) {
            throw new Error('Main file not in file list')
        }

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        const { studyJobId, discardedScanLogPaths } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )
        sweepDiscardedScanLogs(discardedScanLogPaths)

        const coderFilesPath = await getStudyFilesPath(studyId)

        for (const fileName of fileNames) {
            const sanitizedName = sanitizeFileName(fileName)
            const filePath = path.join(coderFilesPath, sanitizedName)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, sanitizedName)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await markCodeSubmitted(db, { studyJobId, userId })
        const round = await codeRoundForJob(studyJobId, db)

        await db.updateTable('study').set({ lastUpdatedAt: new Date() }).where('id', '=', studyId).execute()
        await markStudyOpened(db, { studyId, userId, seenAt: new Date() })

        if (status === 'APPROVED') {
            onStudyCodeSubmitted({ userId, studyId, studyJobId, isResubmission: false })
        } else {
            onStudyProposalSubmitted({ userId, studyId, isResubmission: status === 'CHANGE-REQUESTED' })
        }

        afterCommit(() => onStudyReviewRequested({ studyJobId, round }))

        revalidatePath(Routes.dashboard)
        revalidatePath(Routes.studyReview({ orgSlug, studyId }))

        triggerCodeScan(studyJobId, orgSlug, studyId, round)

        return { studyJobId }
    })

// Lab-shared draft note; last write wins, no CRDT merge (OTTER-558).
export const saveCodeResubmissionNoteDraftAction = new Action('saveCodeResubmissionNoteDraftAction', {
    performsMutations: true,
})
    // Serialized Lexical JSON, sized like the proposal note's draft for the same reason (OTTER-658).
    .params(z.object({ studyId: z.uuid(), note: z.string().max(100_000) }))
    .middleware(withStudySubject)
    .requireAbilityTo('update', 'Study')
    // study.status stays APPROVED during code resubmission; the decision lives on the job, so
    // eligibility comes from the same projected state the resubmit page renders from.
    .middleware(requireResubmittableCode(({ params }) => params.studyId))
    .handler(async ({ db, params: { studyId, note }, session }) => {
        const userLabOrgIds = Object.values(session.orgs)
            .filter((org) => org.type === 'lab')
            .map((org) => org.id)

        // The 0-row check turns a cross-lab attempt into a hard failure instead of letting the
        // client's autosave indicator report "saved" when nothing persisted.
        const editedAt = new Date()
        const saved = await db
            .updateTable('study')
            .set({ codeResubmissionNoteDraft: note, labEditedAt: editedAt })
            .where('id', '=', studyId)
            .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
            .returning(['id'])
            .executeTakeFirst()

        if (!saved) {
            throw new ActionFailure({ submission: 'Study is not editable or you do not have access' })
        }
        await markStudyOpened(db, { studyId, userId: session.user.id, seenAt: editedAt })

        return { studyId, savedAt: new Date().toISOString() }
    })

export const resubmitStudyCodeAction = new Action('resubmitStudyCodeAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.uuid(),
            mainFileName: z.string(),
            fileNames: z.array(z.string()),
            resubmissionNote: resubmissionNoteParam,
        }),
    )
    .middleware(withStudySubject)
    .requireAbilityTo('create', 'StudyJob')
    .middleware(requireStudyAgreement(({ params }) => params.studyId))
    // Also locks the study row, so a co-author's concurrent resubmit of the same round stops here
    // instead of replacing the first one's files in S3.
    .middleware(requireResubmittableCode(({ params }) => params.studyId))
    .handler(async ({ orgSlug, params, session, db, afterCommit }) => {
        const { studyId, mainFileName, fileNames, resubmissionNote } = params

        if (fileNames.length === 0) throw new Error('No files provided')
        if (!fileNames.includes(mainFileName)) throw new Error('Main file not in file list')

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        const { studyJobId, discardedScanLogPaths } = await attachCodeToRoundJob(
            db,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )
        sweepDiscardedScanLogs(discardedScanLogPaths)

        const coderFilesPath = await getStudyFilesPath(studyId)
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
        // The same number for every real history, but derived from the job the result will be
        // written against, so a summary or a scan is never filed under a round the job is not on.
        const round = await codeRoundForJob(studyJobId, db)

        // One row per round (OTTER-802); the key on (job, kind, round, entry type) is the backstop
        // behind the study-row lock above.
        try {
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId,
                    studyJobId,
                    authorId: userId,
                    reviewKind: 'CODE',
                    entryType: 'RESUBMISSION-NOTE',
                    body: JSON.parse(resubmissionNoteToLexicalJson(resubmissionNote)),
                    round: resubmissionRound,
                })
                .execute()
        } catch (err) {
            if (isPgUniqueViolation(err)) {
                throw new ActionFailure({ submission: 'This code has already been resubmitted' })
            }
            throw err
        }

        await db
            .updateTable('study')
            .set({ lastUpdatedAt: new Date(), codeResubmissionNoteDraft: null })
            .where('id', '=', studyId)
            .execute()
        await markStudyOpened(db, { studyId, userId, seenAt: new Date() })

        onStudyCodeSubmitted({ userId, studyId, studyJobId, isResubmission: true })
        afterCommit(() => onStudyReviewRequested({ studyJobId, round }))

        revalidatePath(Routes.dashboard)
        revalidatePath(Routes.studyReview({ orgSlug, studyId }))

        triggerCodeScan(studyJobId, orgSlug, studyId, round)

        return { studyJobId }
    })
