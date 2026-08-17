import type { Route } from 'next'
import { Box, Stack } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ErroredOutputsSharedPanel } from '@/components/study/errored-outputs-shared-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { latestStatusAt } from '@/lib/study-job-status'
import { isErroredOutputsSharedOutcome, projectStudyState } from '@/lib/study-screen'
import { isSubmittedStudy } from '@/schema/study'
import type { OutputsFeedbackThreadEntry } from '@/server/actions/study.actions'
import { getOrgNameFromId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { loadOutputsFeedbackThread } from '../view/load-outputs-feedback-thread'
import type { ScreenComponentProps } from './types'

// Mirrors the feedback-only surface: a failed fetch swaps in the shared notice instead of hiding
// the section, so a researcher never reads "no feedback" when the query simply failed.
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
    // The routing predicate first (raw is in hand, so the check is free and render cannot disagree
    // with the rule table), then the narrowing lookups that cost I/O.
    if (!isErroredOutputsSharedOutcome(projectStudyState(raw))) {
        return (
            <AlertNotFound
                title="Outputs not found"
                message="This study does not have shared outputs to display yet."
            />
        )
    }
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code yet." />
    }

    const { entries, feedbackLoadError } = await loadOutputsFeedbackThread(study.id)
    const dataPartner = displayOrgName(await getOrgNameFromId(study.orgId))
    // The reviewer's decision, not the error: FILES-APPROVED is written when they submit it.
    const decidedAt = latestStatusAt(job.statusChanges, 'FILES-APPROVED')

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ErroredOutputsSharedPanel
                    studyTitle={study.title}
                    dataPartner={dataPartner}
                    decidedAt={decidedAt}
                    job={job}
                    feedbackSection={<FeedbackSection feedbackLoadError={feedbackLoadError} entries={entries} />}
                    previousHref={Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route}
                    editCodeHref={Routes.studyResubmit({ orgSlug, studyId: study.id }) as Route}
                    dashboardHref={dashboardHref as Route}
                />
            </Stack>
        </Box>
    )
}
