import { Box, Stack } from '@mantine/core'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { researcherOutputsFeedbackBanner, type BannerCopy } from '@/lib/study-banners'
import { isFeedbackOnlyOutcome, projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

const FeedbackBanner = ({ copy, decidedAt }: { copy: BannerCopy; decidedAt: Date | string | null }) => (
    <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
        {copy.body}
    </StatusAlert>
)

export async function OutputsFeedbackScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
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
    const nav = resolveStepNav('outputs-feedback', state, {
        orgSlug,
        studyId: study.id,
        dashboardHref,
        returnTo,
    })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    banner={<FeedbackBanner copy={banner} decidedAt={decidedAt} />}
                />
                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
