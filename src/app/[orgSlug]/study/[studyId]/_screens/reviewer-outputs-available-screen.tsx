import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StatusAlert, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

// statusChanges arrive newest-first (see latestJobForStudyQuery ordering), so `find` picks the
// most recent RUN-COMPLETE — the moment the outputs became available for review.
function availableTimestamp(
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>,
): Date | string | null {
    return statusChanges.find((c) => c.status === 'RUN-COMPLETE')?.createdAt ?? null
}

const AvailableBanner = ({ availableAt, labName }: { availableAt: Date | string; labName: string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.action}
        title={`Outputs are available for review • ${dayjs(availableAt).format('MMM DD, YYYY')}`}
    >
        Enter your security key to decrypt the outputs, review them, and then share with {labName}.
    </StatusAlert>
)

// OTTER-676: same two-phase panel as the errored screen (OTTER-675) — the security key gate,
// then the decrypted outputs table, feedback and sharing decision. Only the locked banner copy
// and the feedback cap differ: a completed run gets the longer limit (see outputsFeedbackMaxWords,
// which the server derives independently from the job's own status history).
export async function ReviewerOutputsAvailableScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    // Both not-found branches below are defensive: reviewer-screen-rules (rule 1b) routes here
    // only when a RUN-COMPLETE landed with no files decision, so a routed render always has a
    // submitted job with a completed run. They guard direct renders, not a reachable state.
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const availableAt = availableTimestamp(job.statusChanges)
    if (!availableAt) {
        return (
            <AlertNotFound
                title="Outputs not found"
                message="This study does not have outputs available for review yet."
            />
        )
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <OutputsReviewPanel
            orgSlug={orgSlug}
            studyId={study.id}
            studyTitle={study.title ?? ''}
            job={job}
            labName={labName}
            maxWords={COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS}
            lockedBanner={<AvailableBanner availableAt={availableAt} labName={labName} />}
            unlockedBanner={<ReviewBeforeSharingBanner labName={labName} />}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
        />
    )
}
