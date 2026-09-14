import { StudyPageHeader } from '@/components/study/study-page-header'
import { currentExecutionStage, latestStatusAt } from '@/lib/study-job-status'
import { SecondaryAnalysisView } from '../review/secondary-analysis-view'
import { guardSubmittedJob } from './submitted-job-guard'
import type { ScreenComponentProps } from './types'

export async function ReviewerOutputsPendingScreen({ study, nav }: Pick<ScreenComponentProps, 'study' | 'nav'>) {
    const result = await guardSubmittedJob(study, { noJobMessage: 'This study has no submitted code to review.' })
    if (!('job' in result)) return result

    // Routed from CODE-APPROVED onward, so the enclave may not have reported a stage yet; approval is
    // then the stage, and its own timestamp is when the step opened (the rule guarantees the row).
    const { statusChanges } = result.job
    const stage = currentExecutionStage(statusChanges) ?? {
        status: 'CODE-APPROVED' as const,
        startedAt: latestStatusAt(statusChanges, 'CODE-APPROVED') ?? new Date(),
    }
    return (
        <SecondaryAnalysisView
            header={<StudyPageHeader study={study} />}
            stageStatus={stage.status}
            stageStartedAt={stage.startedAt}
            nav={nav}
        />
    )
}
