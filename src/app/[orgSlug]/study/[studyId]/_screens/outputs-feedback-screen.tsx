import { Box, Stack } from '@mantine/core'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { isFeedbackOnlyOutcome, projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

const FeedbackBanner = ({
    title,
    message,
    decidedAt,
}: {
    title: string
    message: string
    decidedAt: Date | string | null
}) => (
    <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={statusAlertTitle(title, decidedAt)}>
        {message}
    </StatusAlert>
)

const bannerCopy = (errored: boolean, dataPartner: string) =>
    errored
        ? {
              title: 'Resolve the code error to proceed',
              message: `${dataPartner} has shared feedback on why the code run failed. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
          }
        : {
              title: 'Feedback on outputs available',
              message: `${dataPartner} has shared feedback on the latest code run. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
          }

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
    const banner = bannerCopy(state.runErrored, dataPartner)
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
                    studyTitle={study.title}
                    banner={<FeedbackBanner title={banner.title} message={banner.message} decidedAt={decidedAt} />}
                />
                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
