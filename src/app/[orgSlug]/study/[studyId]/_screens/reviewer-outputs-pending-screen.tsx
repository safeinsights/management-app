import { Routes } from '@/lib/routes'
import { displayLabName } from '@/lib/string'
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
            studyTitle={study.title!}
            eyebrow={displayLabName(study.submittingLabName, study.submittedByOrgSlug)}
            stageStatus={stage.status}
            stageStartedAt={stage.startedAt}
            previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
            dashboardHref={Routes.orgDashboard({ orgSlug })}
        />
    )
}
