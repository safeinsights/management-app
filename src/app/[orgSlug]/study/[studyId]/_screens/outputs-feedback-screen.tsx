import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { ButtonLink } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { isFeedbackOnlyOutcome } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

const FeedbackOnlyBanner = ({ decidedAt, dataPartner }: { decidedAt: Date | string | null; dataPartner: string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.action}
        title={statusAlertTitle('Feedback on outputs available', decidedAt)}
    >
        {dataPartner} has shared feedback on the latest code run. The outputs are not available for this study. When you
        are ready, edit your code and resubmit.
    </StatusAlert>
)

// OTTER-695: clean run whose outputs the reviewer withheld with "Share feedback only"
// (FILES-REJECTED without JOB-ERRORED); the researcher reads the feedback and resubmits.
export async function OutputsFeedbackScreen({
    study,
    raw,
    orgSlug,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'>) {
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
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route
    const editCodeHref = Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    studyTitle={study.title!}
                    banner={<FeedbackOnlyBanner decidedAt={decidedAt} dataPartner={dataPartner} />}
                />
                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <Group justify="space-between">
                    <PreviousStepLink previousHref={previousHref} />
                    <ButtonLink href={editCodeHref} variant="outline" size="md">
                        Edit code
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
