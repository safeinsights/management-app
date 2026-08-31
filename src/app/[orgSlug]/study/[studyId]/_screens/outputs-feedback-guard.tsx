import { AlertNotFound } from '@/components/errors'
import type { StudyJobStatus } from '@/database/types'
import { displayOrgName } from '@/lib/string'
import { datedStatusChanges, latestStatusAt } from '@/lib/study-job-status'
import { latestJob, projectStudyState, type RawJob, type RawStudyState, type StudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import type { OutputsFeedbackThreadEntry, SelectedStudy } from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { loadOutputsFeedbackThread } from '../view/load-outputs-feedback-thread'

type GuardSuccess = {
    job: RawJob
    entries: OutputsFeedbackThreadEntry[]
    feedbackLoadError: boolean
    dataPartner: string
    /** When the reviewer submitted the decision. Display-only, so null degrades to an undated banner. */
    decidedAt: Date | string | null
}

type GuardOptions = {
    study: SelectedStudy
    raw: RawStudyState
    /** This screen's routing rule, re-checked here so rendering cannot disagree with the rule table. */
    matches: (state: StudyState) => boolean
    /** Copy for the alert shown when the study is not in this screen's state at all. */
    notFound: { title: string; message: string }
    /** Which FILES-* status dates this screen's banner. */
    decisionStatus: StudyJobStatus
}

/**
 * The shared guard-and-load scaffold for the researcher's post-decision outputs screens
 * (OTTER-695 feedback-only, OTTER-696 errored-and-shared). They differ only in the routing
 * predicate, the not-found copy and which decision status dates the banner — everything else,
 * including the order of guards, was duplicated between them until the OTTER-696 review.
 *
 * The predicate runs first: `raw` is already in hand, so the check is free and cannot disagree
 * with the rule table. Only then do the narrowing lookups that cost I/O.
 *
 * Returns the loaded data on success, or a ReactElement alert on any of the three failure paths.
 * Callers discriminate with `!('job' in result)`, matching guardExecutionStage.
 */
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

    // The banner date comes from the SAME raw job the routing guard decided on — no second
    // latest-job query whose definition could drift from the projection's (OTTER-695 review).
    const job = latestJob(raw.jobs)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedbackThread(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    const decidedAt = latestStatusAt(datedStatusChanges(job.statusChanges), decisionStatus)

    return { job, entries, feedbackLoadError, dataPartner, decidedAt }
}
