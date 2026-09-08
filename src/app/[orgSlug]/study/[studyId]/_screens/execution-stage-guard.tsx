import { isSubmittedStudy } from '@/schema/study'
import { AlertNotFound } from '@/components/errors'
import { currentExecutionStage } from '@/lib/study-job-status'
import { latestSubmittedJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

type Stage = NonNullable<ReturnType<typeof currentExecutionStage>>

type GuardSuccess<S extends Stage | null> = {
    job: LatestJobForStudy
    stage: S
}

type GuardOptions<AllowNoStage extends boolean> = {
    noJobMessage: string
    /** Render even before the enclave has reported a stage (the researcher's screen is routed from CODE-APPROVED). */
    allowNoStage?: AllowNoStage
}

// Returns { job, stage } or a ReactElement alert; callers discriminate with `!('job' in result)`.
export async function guardExecutionStage(
    study: SelectedStudy,
    options: GuardOptions<false>,
): Promise<GuardSuccess<Stage> | React.ReactElement>
export async function guardExecutionStage(
    study: SelectedStudy,
    options: GuardOptions<true>,
): Promise<GuardSuccess<Stage | null> | React.ReactElement>
export async function guardExecutionStage(
    study: SelectedStudy,
    { noJobMessage, allowNoStage = false }: GuardOptions<boolean>,
): Promise<GuardSuccess<Stage | null> | React.ReactElement> {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message={noJobMessage} />
    }

    const stage = currentExecutionStage(job.statusChanges)
    if (!stage && !allowNoStage) {
        return (
            <AlertNotFound
                title="Outputs not yet available"
                message="Code has been approved but execution has not started yet. Please check back shortly."
            />
        )
    }

    return { job, stage }
}
