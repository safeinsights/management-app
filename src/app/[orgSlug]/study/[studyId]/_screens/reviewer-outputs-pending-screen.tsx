import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { currentExecutionStage } from '@/lib/study-job-status'
import { SecondaryAnalysisView } from '../review/secondary-analysis-view'
import { guardSubmittedJob } from './submitted-job-guard'
import type { ScreenComponentProps } from './types'

export async function ReviewerOutputsPendingScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    const result = await guardSubmittedJob(study, { noJobMessage: 'This study has no submitted code to review.' })
    if (!('job' in result)) return result

    // isExecuting routed us here, which implies a pipeline row exists.
    const stage = currentExecutionStage(result.job.statusChanges)!
    return (
        <SecondaryAnalysisView
            studyTitle={study.title}
            header={<StudyPageHeader study={study} />}
            stageStatus={stage.status}
            stageStartedAt={stage.startedAt}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
            dashboardHref={Routes.orgDashboard({ orgSlug })}
        />
    )
}
