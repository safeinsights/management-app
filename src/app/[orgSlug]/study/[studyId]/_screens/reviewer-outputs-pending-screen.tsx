import { isSubmittedStudy } from '@/schema/study'
import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { currentExecutionStage } from '@/lib/study-job-status'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { SecondaryAnalysisView } from '../review/secondary-analysis-view'
import type { ScreenComponentProps } from './types'

export async function ReviewerOutputsPendingScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    const stage = job ? currentExecutionStage(job.statusChanges) : null
    if (!stage) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    return (
        <SecondaryAnalysisView
            studyTitle={study.title}
            stageStatus={stage.status}
            stageStartedAt={stage.startedAt}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
            dashboardHref={Routes.orgDashboard({ orgSlug })}
        />
    )
}
