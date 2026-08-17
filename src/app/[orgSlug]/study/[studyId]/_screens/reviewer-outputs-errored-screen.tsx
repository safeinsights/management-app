import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { filesIncludeErrorLog } from '@/lib/file-type-helpers'
import { jobErrorDetails, NO_ERROR_LOG_TEXT, type JobErrorDetails } from '@/lib/job-error-details'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import { awaitingFilesDecisionOnError, projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

const KEY_PROMPT_TEXT = 'Enter your security key below to review the error log.'

// The reason a service recorded with the failure. Kept as secondary text rather than folded into the
// sentence above it: it is written by the registry or by ECS, is meaningful to the data partner who
// configured the image, and is not a sentence to open with. Rendered as a block-level span because
// StatusAlert puts its children inside a Mantine <Text> (a <p>), where a real block element would be
// invalid markup. Same approach as ReviewBeforeSharingBanner.
const ErrorDetailLine = ({ detail }: { detail: string | null }) => {
    if (!detail) return null
    return <span style={{ display: 'block', fontSize: 12, marginTop: 8 }}>{detail}</span>
}

// OTTER-524: this banner used to promise error logs unconditionally. For the two commonest failures
// there are none, so it now names the stage that failed and says plainly when no log exists.
const ErroredBanner = ({ erroredAt, details }: { erroredAt: Date | string | null; details: JobErrorDetails }) => {
    // The date is display-only, so a payload job missing JOB-ERRORED degrades to an undated
    // banner rather than blocking the triage the state machine already routed here.
    const erroredOn = erroredAt ? `${STATUS_ALERT_SEPARATOR} ${dayjs(erroredAt).format('MMM DD, YYYY')}` : ''
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`Code errored ${erroredOn}`}>
            <span>
                {details.explanation} {details.hasErrorLog ? KEY_PROMPT_TEXT : NO_ERROR_LOG_TEXT}
            </span>
            <ErrorDetailLine detail={details.detail} />
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
    // Keyed on an ERROR log specifically, not on any log: a job that only carries the security scan
    // log from submission has nothing that explains the failure (OTTER-524).
    const details = jobErrorDetails(job.statusChanges, { hasErrorLog: filesIncludeErrorLog(job.files ?? []) })

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
        />
    )
}
