import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { jobErrorDetails, type JobErrorDetails } from '@/lib/job-error-details'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import { awaitingFilesDecisionOnError, projectStudyState } from '@/lib/study-screen'
import { latestRecordedJobFailureReason, latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

// OTTER-524: this banner used to promise error logs unconditionally. For the two commonest failures
// there are none, so it now names the stage that failed and says plainly when no log exists.
const ErroredBanner = ({ erroredAt, details }: { erroredAt: Date | string | null; details: JobErrorDetails }) => {
    // The date is display-only, so a payload job missing JOB-ERRORED degrades to an undated
    // banner rather than blocking the triage the state machine already routed here.
    const erroredOn = erroredAt ? `${STATUS_ALERT_SEPARATOR} ${dayjs(erroredAt).format('MMM DD, YYYY')}` : ''
    const body = `${details.explanation} ${details.logSentence}`
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`Code errored ${erroredOn}`}>
            {body}
        </StatusAlert>
    )
}

export async function ReviewerOutputsErroredScreen({
    study,
    raw,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    // Guards the same predicate rule 1a routes on (reviewer-screen-rules), so routing and rendering
    // cannot disagree about whether an error awaits triage (#922 review). The query above supplies
    // only the panel's job payload.
    if (!awaitingFilesDecisionOnError(projectStudyState(raw))) {
        return <AlertNotFound title="No error found" message="This study has not encountered an error." />
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const erroredAt = latestStatusAt(job.statusChanges, 'JOB-ERRORED')
    // Read here rather than from the job payload: the reason lives on a reviewer-scoped query so it
    // never reaches the researcher, and jobErrorDetails drops anything it cannot classify.
    const recordedReason = await latestRecordedJobFailureReason(job.id)
    // Both the banner copy and the panel's key gate read the same file list through the same
    // predicate, so the screen cannot promise a key form it does not render (OTTER-524).
    const details = jobErrorDetails(job.statusChanges, job.files ?? [], recordedReason)

    return (
        <OutputsReviewPanel
            orgSlug={orgSlug}
            studyId={study.id}
            studyTitle={study.title ?? ''}
            job={job}
            labName={labName}
            maxWords={ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS}
            lockedBanner={<ErroredBanner erroredAt={erroredAt} details={details} />}
            unlockedBanner={<ReviewBeforeSharingBanner labName={labName} />}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
            // A failed run producing nothing is routine, so the reviewer must still be able to close
            // the round out. Deliberately not set on the outputs-available screen (OTTER-524).
            allowDecisionWithoutArtifacts
        />
    )
}
