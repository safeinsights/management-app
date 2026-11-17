import { AlertNotFound } from '@/components/errors'
import { hasOutputsDecision, researcherRunDate } from '@/lib/outputs-review'
import { datedStatusChanges } from '@/lib/study-job-status'
import { latestJob, projectStudyState, type RawJob, type RawStudyState, type StudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import type { OutputsDecisionFeedbackEntry } from '@/server/actions/review-feedback.actions'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { priorCodeRunsForStudy, type PriorCodeRun } from '@/server/db/queries'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'

type GuardSuccess = {
    job: RawJob
    entries: OutputsDecisionFeedbackEntry[]
    feedbackLoadError: boolean
    dataPartner: string
    decidedAt: Date | string | null
    priorRuns: PriorCodeRun[]
}

type GuardOptions = {
    study: SelectedStudy
    raw: RawStudyState
    // Re-checked here so rendering cannot disagree with the rule table.
    matches: (state: StudyState) => boolean
    notFound: { title: string; message: string }
}

// Returns loaded data or a ReactElement alert; callers discriminate with `!('job' in result)`.
export async function guardOutputsFeedbackScreen({
    study,
    raw,
    matches,
    notFound,
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
    const decidedAt = researcherRunDate(datedStatusChanges(job.statusChanges))
    // Every earlier round closes with a decision; the filter only keeps an undecided run from ever
    // reaching the research lab.
    const priorRuns = (await priorCodeRunsForStudy(study.id, job.id)).filter((run) =>
        hasOutputsDecision(run.statusChanges.map((change) => change.status)),
    )

    return { job, entries, feedbackLoadError, dataPartner: study.orgName, decidedAt, priorRuns }
}
