import { isSubmittedStudy } from '@/schema/study'
import { AlertNotFound } from '@/components/errors'
import { currentExecutionStage } from '@/lib/study-job-status'
import { latestSubmittedJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

type GuardSuccess = {
    job: LatestJobForStudy
    stage: NonNullable<ReturnType<typeof currentExecutionStage>>
}

// Returns { job, stage } or a ReactElement alert; callers discriminate with `!('job' in result)`.
export async function guardExecutionStage(
    study: SelectedStudy,
    { noJobMessage }: { noJobMessage: string },
): Promise<GuardSuccess | React.ReactElement> {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message={noJobMessage} />
    }

    const stage = currentExecutionStage(job.statusChanges)
    if (!stage) {
        return (
            <AlertNotFound
                title="Outputs not yet available"
                message="Code has been approved but execution has not started yet. Please check back shortly."
            />
        )
    }

    return { job, stage }
}
