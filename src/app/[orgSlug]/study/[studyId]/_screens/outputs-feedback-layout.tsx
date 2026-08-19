import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { StudyJobStatus } from '@/database/types'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { latestStatusAt } from '@/lib/study-job-status'
import { latestJob, projectStudyState, type RawJob, type StudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import type { OutputsFeedbackThreadEntry } from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { loadOutputsFeedbackThread } from '../view/load-outputs-feedback-thread'
import type { ScreenComponentProps } from './types'

const datedStatusChanges = (job: RawJob) =>
    job.statusChanges.filter((c): c is { status: StudyJobStatus; createdAt: Date | string } => !!c.createdAt)

const FeedbackSection = ({
    feedbackLoadError,
    entries,
}: {
    feedbackLoadError: boolean
    entries: OutputsFeedbackThreadEntry[]
}) => {
    if (feedbackLoadError) {
        return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    }
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

type OutputsFeedbackBannerCopy = {
    title: string
    message: (dataPartner: string) => string
}

const FeedbackBanner = ({
    title,
    message,
    decidedAt,
}: {
    title: string
    message: string
    decidedAt: Date | string | null
}) => {
    // Display-only date: degrade to an undated banner rather than block a page routing already chose.
    const decidedOn = decidedAt ? ` ${STATUS_ALERT_SEPARATOR} ${dayjs(decidedAt).format('MMM DD, YYYY')}` : ''
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`${title}${decidedOn}`}>
            {message}
        </StatusAlert>
    )
}

type OutputsFeedbackLayoutProps = Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'> & {
    matches: (state: StudyState) => boolean
    banner: OutputsFeedbackBannerCopy
}

export async function OutputsFeedbackLayout({
    study,
    raw,
    orgSlug,
    returnTo,
    matches,
    banner,
}: OutputsFeedbackLayoutProps) {
    // The routing predicate first (raw is in hand, so the check is free and render cannot disagree
    // with the rule table), then the narrowing lookups that cost I/O.
    if (!matches(projectStudyState(raw))) {
        return (
            <AlertNotFound
                title="Feedback not found"
                message="This study does not have outputs feedback to display yet."
            />
        )
    }
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    // The banner date comes from the SAME raw job the routing guard decided on — no second
    // latest-job query whose definition could drift from the projection's.
    const job = latestJob(raw.jobs)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedbackThread(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    // Banner date is FILES-REJECTED (the reviewer's withhold), not JOB-ERRORED or the comment timestamp.
    const decidedAt = latestStatusAt(datedStatusChanges(job), 'FILES-REJECTED')
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route
    const editCodeHref = Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route
    const bannerMessage = banner.message(dataPartner)
    const statusBanner = <FeedbackBanner title={banner.title} message={bannerMessage} decidedAt={decidedAt} />

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    studyTitle={study.title}
                    banner={statusBanner}
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
