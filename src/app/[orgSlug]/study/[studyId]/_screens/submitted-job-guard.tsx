import { isSubmittedStudy } from '@/schema/study'
import { AlertNotFound } from '@/components/errors'
import { latestSubmittedJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// Existence only: the rule table has already decided the calling screen may render, so each screen
// reads the display values it needs (execution stage, approval date) off the job itself.
// Returns { job } or a ReactElement alert; callers discriminate with `!('job' in result)`.
export async function guardSubmittedJob(
    study: SelectedStudy,
    { noJobMessage }: { noJobMessage: string },
): Promise<{ job: LatestJobForStudy } | React.ReactElement> {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message={noJobMessage} />
    }

    return { job }
}
