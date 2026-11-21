import type { DBExecutor } from '@/database'
import {
    JobTransitionRefusedError,
    writeJobStatus,
    type JobStatusWriteOptions,
    type JobStatusWriteResult,
} from '@/database/job-status-writer'
import type { JobStatus } from '@/lib/job-status-rules'
import logger from '@/lib/logger'
import { onJobErrored } from '@/server/events'
import { withTransaction } from '@/server/request-context'
import { notifyStudyChanged } from '@/server/study-events'

export { JobTransitionRefusedError }

const isMachineActor = (actor: JobStatusWriteOptions['actor']) => actor === 'enclave' || actor === 'service'

// The app's one way to change a job's status. Inside an action, pass its db so the write joins it.
export async function transitionJob(
    db: DBExecutor,
    jobId: string,
    to: JobStatus,
    {
        actor,
        userId,
        message,
        publish = true,
    }: Omit<JobStatusWriteOptions, 'at'> & {
        // False for a decision action, which publishes its own decision event instead.
        publish?: boolean
    },
): Promise<JobStatusWriteResult> {
    try {
        return await withTransaction(db, async (trx) => {
            const result = await writeJobStatus(trx, jobId, to, { actor, userId, message })
            if (result.observed) {
                logger.warn(`job ${jobId}: ${actor} wrote ${result.from} -> ${to}, which the transition table refuses`)
            }
            // Queued on commit, so a rollback sends nothing.
            if (result.outcome === 'moved' && to === 'JOB-ERRORED' && actor !== 'qa') {
                await onJobErrored({ studyId: result.studyId })
            }
            // On the transaction, so open pages hear of the new row only once it commits. A repeat
            // or a no-op writes no row, so it publishes nothing.
            if ((result.outcome === 'moved' || result.outcome === 'logged') && publish) {
                await notifyStudyChanged(trx, { studyId: result.studyId, jobId, change: 'job-status' })
            }
            return result
        })
    } catch (error) {
        if (error instanceof JobTransitionRefusedError && isMachineActor(actor)) {
            logger.warn(`job ${jobId}: refused ${actor} ${error.from} -> ${to} (${error.reason})`)
        }
        throw error
    }
}
