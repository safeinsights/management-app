import type { StudyJobStatus } from '@/database/types'
import { onJobErrored } from './events'
import { currentDb } from '@/server/request-context'

type RecordedJobStatus = { recorded: true } | { recorded: false; last: { id: string; message: string | null } }

// setup-app, the containerizer and the scanner all re-send a status they have already reported, so a repeat
// of the job's latest status is not recorded. Recording JOB-ERRORED is what emails the Data Partner.
export async function recordJobStatus(
    job: { id: string; studyId: string },
    values: { status: StudyJobStatus; userId?: string; message?: string | null },
): Promise<RecordedJobStatus> {
    const last = await currentDb()
        .selectFrom('jobStatusChange')
        .select(['id', 'status', 'message'])
        .where('studyJobId', '=', job.id)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (last?.status === values.status) return { recorded: false, last }

    await currentDb()
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, ...values })
        .execute()
    if (values.status === 'JOB-ERRORED') onJobErrored({ studyId: job.studyId })

    return { recorded: true }
}
