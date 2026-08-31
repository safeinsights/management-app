import type { Route } from 'next'
import { Box, Stack } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { isErroredOutputsSharedOutcome } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

/**
 * OTTER-696: an errored run whose outputs the reviewer released with "Share outputs and feedback"
 * (JOB-ERRORED + FILES-APPROVED). The researcher decrypts to diagnose the failure, then edits and
 * resubmits. Distinct from the clean-run share (`study-results`) and from the withheld-outputs
 * case (`outputs-feedback`, OTTER-695), which shows no key form at all.
 */
export async function OutputsErroredSharedScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: isErroredOutputsSharedOutcome,
        notFound: {
            title: 'Outputs not found',
            message: 'This study does not have shared outputs to display yet.',
        },
        // The reviewer's decision, not the error: FILES-APPROVED is written when they submit it.
        decisionStatus: 'FILES-APPROVED',
    })
    if (!('job' in result)) return result

    const { job, entries, feedbackLoadError, dataPartner, decidedAt } = result

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <SharedOutputsPanel
                    studyTitle={study.title!}
                    decidedAt={decidedAt}
                    banner={{
                        locked: {
                            title: 'Decrypt outputs to view code error',
                            body: `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`,
                        },
                        unlocked: {
                            title: 'Outputs and feedback available',
                            body: "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit.",
                        },
                    }}
                    job={job}
                    feedbackSection={
                        <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                    }
                    previousHref={Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route}
                    editCodeHref={Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route}
                    dashboardHref={dashboardHref as Route}
                />
            </Stack>
        </Box>
    )
}
