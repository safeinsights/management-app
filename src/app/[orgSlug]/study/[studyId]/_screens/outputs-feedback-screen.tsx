import { semanticColor } from '@/theme/tokens'
import { Box, Stack } from '@mantine/core'
import { DatedStatusBanner } from '@/components/study/dated-status-banner'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { MarkOutputsDecisionViewed } from '@/components/study/mark-outputs-decision-viewed'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { researcherOutputsFeedbackBanner } from '@/lib/study-banners'
import { isFeedbackOnlyOutcome, projectStudyState } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

export async function OutputsFeedbackScreen({ study, raw, nav }: Pick<ScreenComponentProps, 'study' | 'raw' | 'nav'>) {
    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: isFeedbackOnlyOutcome,
        notFound: {
            title: 'Feedback not found',
            message: 'This study does not have outputs feedback to display yet.',
        },
        decisionStatus: 'FILES-REJECTED',
    })
    if (!('job' in result)) return result

    const { entries, feedbackLoadError, dataPartner, decidedAt } = result
    const state = projectStudyState(raw)
    const banner = researcherOutputsFeedbackBanner({ runErrored: state.runErrored }, { dataPartner })

    return (
        <Box bg={semanticColor('surface.page')}>
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <MarkOutputsDecisionViewed studyId={study.id} />
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    banner={<DatedStatusBanner copy={banner} at={decidedAt} />}
                />
                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
