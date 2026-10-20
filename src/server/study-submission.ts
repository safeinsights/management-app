import { DB } from '@/database/types'
import { pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { sleep } from '@/lib/utils'
import { deleteFolderContents, triggerScanForStudyJob } from '@/server/aws'
import { SIMULATE_CODE_BUILD } from '@/server/config'
import { codeRoundForJob, isCurrentCodeRound } from '@/server/db/code-round'
import { getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { deferred } from '@/server/events'
import { purgeProposalYjsDocsBeforeAt } from '@/server/db/yjs-cleanup'
import { deleteDiscardedScanLogObjects, discardStaleScanLogRows } from '@/server/storage'
import logger from '@/lib/logger'
import { Kysely } from 'kysely'
import { currentDb } from '@/server/request-context'

const simulateJobScan = deferred(async (studyJobId: string, round: number) => {
    await sleep({ 1: 'seconds' })
    // Mirrors the webhook's own rule, so a resubmit during the simulated scan behaves in dev and QA
    // as it does in production (OTTER-779).
    if (!(await isCurrentCodeRound(studyJobId, round, currentDb()))) return
    await currentDb().insertInto('jobStatusChange').values({ studyJobId, status: 'CODE-SCANNED' }).execute()
})

// A Hocuspocus persist can commit after the in-tx delete; re-delete rows
// older than the captured submit timestamp.
export const purgeProposalYjsDocsAfterFinalize = deferred(async (args: { studyId: string; beforeAt: Date }) => {
    await sleep({ 5: 'seconds' })
    await purgeProposalYjsDocsBeforeAt(currentDb(), args)
})

// Runs after the response, so the rows these objects belonged to are committed as deleted. Doing it
// in the transaction would let a rollback restore a row over a missing object (OTTER-775 review).
export const sweepDiscardedScanLogs = deferred(async (paths: ReadonlyArray<string>) => {
    await deleteDiscardedScanLogObjects(paths)
})

export function triggerCodeScan(studyJobId: string, orgSlug: string, studyId: string, round: number) {
    if (SIMULATE_CODE_BUILD) {
        simulateJobScan(studyJobId, round)
    } else {
        triggerScanForStudyJob({ studyJobId, orgSlug, studyId, round }).catch((err) =>
            logger.error('Failed to trigger code scan', err, { studyJobId }),
        )
    }
}

// Reuses the job opened at IDE launch rather than minting a new one (OTTER-601).
export async function attachCodeToRoundJob(
    db: Kysely<DB>,
    studyId: string,
    orgSlug: string,
    mainCodeFileName: string,
    codeFileNames: string[],
) {
    const job = await getOrCreateCurrentRoundJob(db, studyId)
    const studyJobId = job.id
    // Objects whose rows this function deleted. The caller sweeps them once the transaction has
    // committed, so a rollback can never restore a row over a deleted object (OTTER-775 review).
    let discardedScanLogPaths: string[] = []

    if (!job.created) {
        await db
            .deleteFrom('studyJobFile')
            .where('studyJobId', '=', studyJobId)
            .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
            .execute()
        await deleteFolderContents(pathForStudyJobCode({ orgSlug, studyId, studyJobId }))
        // Earlier rounds keep their summaries, which is what the round column is for. This round's
        // goes, because a replacement the reviewer has not yet decided on opens no new round: its
        // summary would otherwise describe deleted code and short-circuit the regeneration that
        // follows (SHRMP-263, OTTER-779).
        if (await roundIsAlreadySubmitted(db, studyJobId)) {
            const round = await codeRoundForJob(studyJobId, db)
            await db.deleteFrom('studyReview').where('studyJobId', '=', studyJobId).where('round', '=', round).execute()
        }
        discardedScanLogPaths = await discardStaleScanLogRows(studyJobId, db)
    }

    const codeFiles = [
        { name: mainCodeFileName, fileType: 'MAIN-CODE' as const },
        ...codeFileNames.map((name) => ({ name, fileType: 'SUPPLEMENTAL-CODE' as const })),
    ]
    await db
        .insertInto('studyJobFile')
        .values(
            codeFiles.map(({ name, fileType }) => ({
                name,
                fileType,
                studyJobId,
                path: pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, name),
            })),
        )
        .execute()

    return { studyJobId, discardedScanLogPaths }
}

// Once per submission round, not per job: a change-requested resubmit stays on the same job, and
// submissions and change requests alternate on it, so the round this job is on has been submitted
// iff submitted-count > change-requested-count. A further upload while that holds replaces the
// round's code without opening a new round.
async function roundIsAlreadySubmitted(db: Kysely<DB>, studyJobId: string) {
    const counts = await db
        .selectFrom('jobStatusChange')
        .select((eb) => [
            eb.fn.count<number>('id').filterWhere('status', '=', 'CODE-SUBMITTED').as('submitted'),
            eb.fn.count<number>('id').filterWhere('status', '=', 'CODE-CHANGES-REQUESTED').as('requested'),
        ])
        .where('studyJobId', '=', studyJobId)
        .executeTakeFirstOrThrow()

    return Number(counts.submitted) > Number(counts.requested)
}

export async function markCodeSubmitted(
    db: Kysely<DB>,
    { studyJobId, userId }: { studyJobId: string; userId: string },
) {
    if (await roundIsAlreadySubmitted(db, studyJobId)) return
    await db.insertInto('jobStatusChange').values({ studyJobId, userId, status: 'CODE-SUBMITTED' }).execute()
}
