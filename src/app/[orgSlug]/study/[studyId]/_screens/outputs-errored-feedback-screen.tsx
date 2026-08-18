import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { latestStatusAt } from '@/lib/study-job-status'
import { isErroredFeedbackOnlyOutcome, latestJob, projectStudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import { getOrgNameFromId } from '@/server/db/queries'
import { loadOutputsFeedbackThread } from '../view/load-outputs-feedback-thread'
import { datedStatusChanges, FeedbackSection } from './outputs-feedback-section'
import type { ScreenComponentProps } from './types'

const ErroredFeedbackOnlyBanner = ({
    decidedAt,
    dataPartner,
}: {
    decidedAt: Date | string | null
    dataPartner: string
}) => {
    const decidedOn = decidedAt ? `${STATUS_ALERT_SEPARATOR} ${dayjs(decidedAt).format('MMM DD, YYYY')}` : ''
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.action} title={`Resolve the code error to proceed ${decidedOn}`}>
            {dataPartner} has shared feedback on why the code run failed. The outputs are not available for this study.
            When you are ready, edit your code and resubmit.
        </StatusAlert>
    )
}

// Errored run whose outputs the reviewer withheld with "Share feedback only"
// (JOB-ERRORED + FILES-REJECTED). No outputs table or security key — nothing was released to decrypt.
export async function OutputsErroredFeedbackScreen({
    study,
    raw,
    orgSlug,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'>) {
    if (!isErroredFeedbackOnlyOutcome(projectStudyState(raw))) {
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

    const job = latestJob(raw.jobs)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedbackThread(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    // The reviewer's decision, not the error: FILES-REJECTED is written when they submit it.
    const decidedAt = latestStatusAt(datedStatusChanges(job), 'FILES-REJECTED')
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route
    const editCodeHref = Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    studyTitle={study.title}
                    banner={<ErroredFeedbackOnlyBanner decidedAt={decidedAt} dataPartner={dataPartner} />}
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
