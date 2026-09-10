import { AlertNotFound } from '@/components/errors'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { reviewerCodeNeedsReviewBanner } from '@/lib/study-banners'
import { Routes } from '@/lib/routes'
import { type Submitted } from '@/schema/study'
import { jobAnalysisForJob, latestJobForStudyOrNull } from '@/server/db/queries'
import { Box, Stack } from '@mantine/core'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewClient } from './code-review-client'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'
import { CollapsibleSubmittedCodeSection } from './collapsible-submitted-code-section'

type CodeReviewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: CodeReviewFeedbackEntry[]
}

// On the current round, entries exist only when a prior round does, so any entry implies a
// resubmission.
function deriveCodeReviewVersion(entries: CodeReviewFeedbackEntry[]): number {
    if (entries.length === 0) return 1
    const versions = entries.map((entry) => entry.version).filter((v): v is number => v != null)
    if (versions.length === 0) return 1
    return Math.max(...versions)
}

function codeReviewHeading(version: number): string {
    if (version <= 1) return 'Review study code'
    return `Review study code v${version}.0`
}

type CodeReviewStatusBannerProps = {
    labName: string
    version: number
    submittedAt: Date | string | null
}

function CodeReviewStatusBanner({ labName, version, submittedAt }: CodeReviewStatusBannerProps) {
    const copy = reviewerCodeNeedsReviewBanner({ researchLab: labName, version })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, submittedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

export async function CodeReview({ orgSlug, study, entries }: CodeReviewProps) {
    const job = await latestJobForStudyOrNull(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const analysis = await jobAnalysisForJob(job)
    // Not /review, which would re-resolve to this very screen (OTTER-643, OTTER-727).
    const previousHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })
    const latestJobStatus = job.statusChanges.at(0)?.status ?? null

    const version = deriveCodeReviewVersion(entries)
    const isResubmission = version > 1
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const heading = codeReviewHeading(version)
    const submittedAt = latestCodeSubmittedAt(job)

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <CollapsibleSubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    analysis={analysis}
                    stepLabel="STEP 3"
                    heading={heading}
                    banner={<CodeReviewStatusBanner labName={labName} version={version} submittedAt={submittedAt} />}
                    initiallyExpanded={!isResubmission}
                />
                {isResubmission && <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />}
                <CodeReviewClient
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    latestJobStatus={latestJobStatus}
                    previousHref={previousHref}
                />
            </Stack>
        </Box>
    )
}
