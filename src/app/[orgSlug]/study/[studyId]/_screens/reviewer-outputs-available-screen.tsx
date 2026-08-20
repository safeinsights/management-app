import { AlertNotFound } from '@/components/errors'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import { projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

const AvailableBanner = ({ availableAt, labName }: { availableAt: Date | string | null; labName: string }) => {
    return (
        <StatusAlert
            variant={STATUS_ALERT_VARIANT.action}
            title={statusAlertTitle('Outputs are available for review', availableAt)}
        >
            Enter your security key to decrypt the outputs, review them, and then share with {labName}.
        </StatusAlert>
    )
}

// OTTER-676: same two-phase panel as the errored screen (OTTER-675) — the security key gate,
// then the decrypted outputs table, feedback and sharing decision. Only the locked banner copy
// and the feedback cap differ: a completed run gets the longer limit (see outputsFeedbackMaxWords,
// which the server derives independently from the job's own status history).
export async function ReviewerOutputsAvailableScreen({
    study,
    raw,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    // Guards the same fact rule 1b routes on (reviewer-screen-rules), so routing and rendering
    // cannot disagree about whether outputs are available (#922 review). The query above supplies
    // only the panel's job payload.
    const state = projectStudyState(raw)
    if (state.resultsDisplayStatus !== 'RUN-COMPLETE') {
        return (
            <AlertNotFound
                title="Outputs not found"
                message="This study does not have outputs available for review yet."
            />
        )
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const availableAt = latestStatusAt(job.statusChanges, 'RUN-COMPLETE')

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
