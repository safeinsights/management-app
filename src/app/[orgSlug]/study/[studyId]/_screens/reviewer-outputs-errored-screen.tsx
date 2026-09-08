import { AlertNotFound } from '@/components/errors'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { jobErrorDetails, type JobErrorDetails } from '@/lib/job-error-details'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import { awaitingFilesDecisionOnError, projectStudyState } from '@/lib/study-screen'
import { latestRecordedJobFailureReason, latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

// OTTER-524: names the stage that failed and says plainly when no error log exists.
const ErroredBanner = ({ erroredAt, details }: { erroredAt: Date | string | null; details: JobErrorDetails }) => {
    const body = `${details.explanation} ${details.logSentence}`
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={statusAlertTitle('Code errored', erroredAt)}>
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

    // The same predicate the routing rules use, so routing and rendering cannot disagree.
    if (!awaitingFilesDecisionOnError(projectStudyState(raw))) {
        return <AlertNotFound title="No error found" message="This study has not encountered an error." />
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const erroredAt = latestStatusAt(job.statusChanges, 'JOB-ERRORED')
    // Reviewer-scoped query, so the raw reason never reaches the researcher.
    const recordedReason = await latestRecordedJobFailureReason(job.id)
    // Banner copy and key gate read the same predicate, so the screen cannot promise a key form
    // it does not render (OTTER-524).
    const details = jobErrorDetails(job.statusChanges, job.files ?? [], recordedReason)

    return (
        <OutputsReviewPanel
            orgSlug={orgSlug}
            studyId={study.id}
            studyTitle={study.title}
            job={job}
            labName={labName}
            header={<StudyPageHeader study={study} />}
            lockedBanner={<ErroredBanner erroredAt={erroredAt} details={details} />}
            unlockedBanner={<ReviewBeforeSharingBanner labName={labName} />}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
            // A failed run producing nothing is routine, so the round must still be closable.
            // Deliberately not set on the outputs-available screen (OTTER-524).
            allowDecisionWithoutArtifacts
        />
    )
}
