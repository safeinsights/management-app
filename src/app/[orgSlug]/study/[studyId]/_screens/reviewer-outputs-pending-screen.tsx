import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { SecondaryAnalysisView } from '../review/secondary-analysis-view'
import { guardExecutionStage } from './execution-stage-guard'
import type { ScreenComponentProps } from './types'

export async function ReviewerOutputsPendingScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    const result = await guardExecutionStage(study, { noJobMessage: 'This study has no submitted code to review.' })
    if (!('job' in result)) return result

    const { stage } = result
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
