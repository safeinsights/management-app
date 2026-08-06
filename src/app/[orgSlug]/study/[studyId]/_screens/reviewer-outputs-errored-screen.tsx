import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StatusAlert, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import { awaitingFilesDecisionOnError, projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

const ErroredBanner = ({ erroredAt }: { erroredAt: Date | string | null }) => {
    // The date is display-only, so a payload job missing JOB-ERRORED degrades to an undated
    // banner rather than blocking the triage the state machine already routed here.
    const erroredOn = erroredAt ? ` • ${dayjs(erroredAt).format('MMM DD, YYYY')}` : ''
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`Code errored${erroredOn}`}>
            Enter your security key below to access the outputs and see what went wrong.
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

    return (
        <OutputsReviewPanel
            orgSlug={orgSlug}
            studyId={study.id}
            studyTitle={study.title ?? ''}
            job={job}
            labName={labName}
            maxWords={ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS}
            lockedBanner={<ErroredBanner erroredAt={erroredAt} />}
            unlockedBanner={<ReviewBeforeSharingBanner labName={labName} />}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
        />
    )
}
