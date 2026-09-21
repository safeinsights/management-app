import { AlertNotFound } from '@/components/errors'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import { displayOrgName } from '@/lib/string'
import { datedStatusChanges, latestStatusAt } from '@/lib/study-job-status'
import { latestJob, projectStudyState, type RawJob, type RawStudyState, type StudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import type { OutputsDecisionFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { markOutputsViewed } from '@/server/db/mutations'
import { getOrgNameFromId } from '@/server/db/queries'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'

type GuardSuccess = {
    job: RawJob
    entries: OutputsDecisionFeedbackEntry[]
    feedbackLoadError: boolean
    dataPartner: string
    decidedAt: Date | string | null
}

type GuardOptions = {
    study: SelectedStudy
    raw: RawStudyState
    // Re-checked here so rendering cannot disagree with the rule table.
    matches: (state: StudyState) => boolean
    notFound: { title: string; message: string }
    decisionStatus: StudyJobStatus
}

// Returns loaded data or a ReactElement alert; callers discriminate with `!('job' in result)`.
export async function guardOutputsFeedbackScreen({
    study,
    raw,
    matches,
    notFound,
    decisionStatus,
}: GuardOptions): Promise<GuardSuccess | React.ReactElement> {
    if (!matches(projectStudyState(raw))) {
        return <AlertNotFound title={notFound.title} message={notFound.message} />
    }
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    // Same raw job the routing guard decided on, so no second query can drift from it.
    const job = latestJob(raw.jobs)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedback(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    const decidedAt = latestStatusAt(datedStatusChanges(job.statusChanges), decisionStatus)

    // Reaching here means the researcher is looking at a released decision, which is what flips their
    // pill to "Outputs reviewed" (OTTER-698). All three researcher outputs screens come through this
    // guard, so the stamp lands wherever the decision is read.
    await markOutputsViewed(db, study.id)

    return { job, entries, feedbackLoadError, dataPartner, decidedAt }
}
