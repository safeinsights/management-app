import { semanticColor } from '@/theme/tokens'
import { FC } from 'react'
import { Box, Stack, Text } from '@mantine/core'
import { CodeRunCard, CodeRunSectionTitle } from '@/components/study/code-run-card'
import { CodeRunFeedback } from '@/components/study/code-run-feedback'
import { DatedStatusBanner } from '@/components/study/dated-status-banner'
import { MarkOutputsDecisionViewed } from '@/components/study/mark-outputs-decision-viewed'
import { ProposalStepHeader, VERIFY_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { ResearcherCodeRunHistory } from '@/components/study/researcher-code-run-history'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { isFeedbackOnlyRun, latestRunFeedback } from '@/lib/outputs-review'
import { researcherOutputsFeedbackBanner } from '@/lib/study-banners'
import { isFeedbackOnlyOutcome, projectStudyState } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { PriorCodeRun } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'
import { PageLayout } from '@/components/page-layout'

// The history asks for its own key only when an earlier run shared outputs it could open.
const hasSharedOutputs = (runs: PriorCodeRun[]) => runs.some((run) => !isFeedbackOnlyRun(run.statusChanges))

export async function OutputsFeedbackScreen({ study, raw, nav }: Pick<ScreenComponentProps, 'study' | 'raw' | 'nav'>) {
    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: isFeedbackOnlyOutcome,
        notFound: {
            title: 'Feedback not found',
            message: 'This study does not have outputs feedback to display yet.',
        },
    })
    if (!('job' in result)) return result

    const { job, entries, feedbackLoadError, dataPartner, decidedAt, priorRuns } = result
    const state = projectStudyState(raw)
    const banner = researcherOutputsFeedbackBanner({ runErrored: state.runErrored }, { dataPartner })

    return (
        <Box bg={semanticColor('surface.page')}>
            <PageLayout header={<StudyPageHeader study={study} step={VERIFY_OUTPUTS_STEP} />}>
                <MarkOutputsDecisionViewed studyId={study.id} />
                <ProposalStepHeader
                    stepLabel={VERIFY_OUTPUTS_STEP.label}
                    heading={VERIFY_OUTPUTS_STEP.heading}
                    banner={<DatedStatusBanner copy={banner} at={decidedAt} />}
                />
                <CodeRunCard date={decidedAt}>
                    <NoSharedOutputs />
                    <CodeRunFeedback
                        feedback={latestRunFeedback(entries, job.id)}
                        loadError={feedbackLoadError}
                        testId="latest-run-feedback"
                    />
                </CodeRunCard>
                <ResearcherCodeRunHistory
                    // Keyed by job so history state can never carry over to another study's page.
                    key={job.id}
                    runs={priorRuns}
                    withHistoryKey={hasSharedOutputs(priorRuns)}
                />
                <StepNavigation nav={nav} />
            </PageLayout>
        </Box>
    )
}

// No key input and no file query: outputs must never reach the researcher when only feedback was
// shared (OTTER-1060).
const NoSharedOutputs: FC = () => (
    <Stack gap="lg">
        <CodeRunSectionTitle>Output files</CodeRunSectionTitle>
        <Text fz="md" c={semanticColor('text.primary')}>
            No output files were shared for this code run.
        </Text>
    </Stack>
)
