import type { Route } from 'next'
import { Box, Stack } from '@mantine/core'
import { SharedOutputsPanel } from '@/components/study/shared-outputs-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { isOutputsSharedOutcome } from '@/lib/study-screen'
import { guardOutputsFeedbackScreen } from './outputs-feedback-guard'
import type { ScreenComponentProps } from './types'

/**
 * OTTER-688: a clean run whose outputs the reviewer released with "Share outputs and feedback"
 * (RUN-COMPLETE + FILES-APPROVED, no JOB-ERRORED). The researcher decrypts, reads the outputs and
 * feedback, then either resubmits or leaves.
 *
 * The errored counterpart is `outputs-errored-shared` (OTTER-696), which shares this whole panel and
 * differs only in banner copy; the withheld-outputs case is `outputs-feedback` (OTTER-695/697),
 * which shows no key form at all.
 */
export async function OutputsSharedScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    const result = await guardOutputsFeedbackScreen({
        study,
        raw,
        matches: isOutputsSharedOutcome,
        notFound: {
            title: 'Outputs not found',
            message: 'This study has no shared outputs to display yet.',
        },
        // The reviewer's decision, not the run: FILES-APPROVED is written when they submit it.
        decisionStatus: 'FILES-APPROVED',
    })
    if (!('job' in result)) return result

    const { job, entries, feedbackLoadError, dataPartner, decidedAt } = result

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                {/* Banner titles are undated on purpose — the panel appends the shared decision date
                    to both, so the two phases can never disagree about when it was made. */}
                <SharedOutputsPanel
                    studyTitle={study.title!}
                    decidedAt={decidedAt}
                    banner={{
                        locked: {
                            title: 'Decrypt to view your outputs',
                            body: `${dataPartner} has reviewed and shared the outputs. Use your security key to decrypt and review them.`,
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
