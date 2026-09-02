import { AlertNotFound } from '@/components/errors'
import { OutputsReviewPanel } from '@/components/study/outputs-review-panel'
import { ReviewBeforeSharingBanner } from '@/components/study/review-before-sharing-banner'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { StudyPageHeader } from '@/components/study/study-page-header'
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

// OTTER-676: the same two-phase panel as the errored screen; only the locked banner copy differs.
export async function ReviewerOutputsAvailableScreen({
    study,
    raw,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    // The same predicate the routing rules use, so routing and rendering cannot disagree.
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
            studyTitle={study.title}
            job={job}
            labName={labName}
            header={<StudyPageHeader study={study} />}
            lockedBanner={<AvailableBanner availableAt={availableAt} labName={labName} />}
            unlockedBanner={<ReviewBeforeSharingBanner labName={labName} />}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
        />
    )
}
