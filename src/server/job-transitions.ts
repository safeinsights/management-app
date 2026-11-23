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

export { JobTransitionRefusedError }

const isMachineActor = (actor: JobStatusWriteOptions['actor']) => actor === 'enclave' || actor === 'service'

// The app's one way to change a job's status. Inside an action, pass its db so the write joins it.
export async function transitionJob(
    db: DBExecutor,
    jobId: string,
    to: JobStatus,
    { actor, userId, message }: Omit<JobStatusWriteOptions, 'at'>,
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
            return result
        })
    } catch (error) {
        if (error instanceof JobTransitionRefusedError && isMachineActor(actor)) {
            logger.warn(`job ${jobId}: refused ${actor} ${error.from} -> ${to} (${error.reason})`)
        }
        throw error
    }
}
