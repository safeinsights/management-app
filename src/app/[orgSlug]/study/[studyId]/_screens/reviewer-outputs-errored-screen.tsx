import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StatusAlert, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

function erroredTimestamp(
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>,
): Date | string | null {
    return statusChanges.find((c) => c.status === 'JOB-ERRORED')?.createdAt ?? null
}

const ErroredBanner = ({ erroredAt }: { erroredAt: Date | string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.action}
        title={`Code errored • ${dayjs(erroredAt).format('MMM DD, YYYY')}`}
    >
        Enter your security key below to access the outputs and see what went wrong.
    </StatusAlert>
)

export async function ReviewerOutputsErroredScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const erroredAt = erroredTimestamp(job.statusChanges)
    if (!erroredAt) {
        return <AlertNotFound title="No error found" message="This study has not encountered an error." />
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug

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
