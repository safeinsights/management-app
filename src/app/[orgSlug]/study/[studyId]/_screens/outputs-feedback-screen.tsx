import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { latestStatusAt } from '@/lib/study-job-status'
import { projectStudyState } from '@/lib/study-screen'
import type { OutputsFeedbackEntry } from '@/server/actions/study.actions'
import { getOrgNameFromId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'
import type { ScreenComponentProps } from './types'

const FeedbackOnlyBanner = ({ decidedAt, dataPartner }: { decidedAt: Date | string | null; dataPartner: string }) => {
    // Display-only date: degrade to an undated banner rather than block a page routing already chose.
    const decidedOn = decidedAt ? ` ${STATUS_ALERT_SEPARATOR} ${dayjs(decidedAt).format('MMM DD, YYYY')}` : ''
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`Feedback on outputs available${decidedOn}`}>
            {dataPartner} has shared feedback on the latest code run. The outputs are not available for this study. When
            you are ready, edit your code and resubmit.
        </StatusAlert>
    )
}

// Mirrors the code surface: a failed fetch swaps in the shared notice instead of hiding the section.
const FeedbackSection = ({
    feedbackLoadError,
    entries,
}: {
    feedbackLoadError: boolean
    entries: OutputsFeedbackEntry[]
}) => {
    if (feedbackLoadError) {
        return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    }
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

// OTTER-695: clean run whose outputs the reviewer withheld with "Share feedback only"
// (FILES-REJECTED without JOB-ERRORED); the researcher reads the feedback and resubmits.
export async function OutputsFeedbackScreen({
    study,
    raw,
    orgSlug,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    // Guards the same facts the researcher rule routes on, so routing and rendering cannot
    // disagree; the query above supplies only the banner's date payload.
    const state = projectStudyState(raw)
    if (!state.resultsRejected || state.resultsErrored) {
        return (
            <AlertNotFound
                title="Feedback not found"
                message="This study does not have outputs feedback to display yet."
            />
        )
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedback(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    const decidedAt = latestStatusAt(job.statusChanges, 'FILES-REJECTED')
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
                <FeedbackSection feedbackLoadError={feedbackLoadError} entries={entries} />
                <Group justify="space-between">
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Previous step
                    </ButtonLink>
                    <ButtonLink href={editCodeHref} variant="outline" size="md">
                        Edit code
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
