'use client'

import { type FC, type ReactNode } from 'react'
import type { Route } from 'next'
import { Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { LinkWithIcon } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { SubmittedCodeTable } from '@/components/study/submitted-code-table'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { useExpandable } from '@/hooks/use-expandable'
import { StudyCodeToggle } from './study-code-collapse'
import { displayOrgName } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { researcherCodeDecisionBanner, type BannerCopy } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { type CodeDecisionStatus } from '@/lib/study-job-status'
import type { StepNav } from '@/lib/study-screen'

type CodeFileList = LatestJobForStudy['files']

interface CodePostDecisionViewProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    reviewingOrgName: string
    /**
     * Org-scoped entry: threaded onto the "View approved initial request" link so org scope survives.
     * The step nav carries its own copy of it through NavCtx.
     */
    returnTo?: 'org'
    latestJobStatus: CodeDecisionStatus
    nav: StepNav
    /** When the reviewer-feedback fetch failed, show an inline notice instead of the feedback section. */
    feedbackLoadError?: boolean
}

// Dated from the decision's own status-change row so it survives empty or stale feedback entries.
function deriveCodePostDecision({
    job,
    entries,
    decision,
}: {
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    decision: CodeDecisionStatus
}) {
    return {
        timestampDate: job.statusChanges.find((s) => s.status === decision)?.createdAt ?? entries[0]?.createdAt ?? null,
        codeFiles: filterAndOrderCodeFiles(job.files),
    }
}

const DecisionBanner: FC<{ copy: BannerCopy; decidedAt: Date | string | null }> = ({ copy, decidedAt }) => (
    <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
        {copy.body}
    </StatusAlert>
)

type StepCardProps = {
    study: Submitted<SelectedStudy>
    banner: ReactNode
    expanded: boolean
    onToggle: () => void
}

function StepCard({ study, banner, expanded, onToggle }: StepCardProps) {
    return (
        <ProposalStepHeader stepLabel="STEP 4" heading="Study code" studyTitle={study.title} banner={banner}>
            <StudyCodeToggle isVisible={!expanded} expanded={expanded} onClick={onToggle} />
        </ProposalStepHeader>
    )
}

// Its own card per OTTER-590: collapsed, only the in-step toggle shows.
type SubmittedCodePanelProps = {
    expanded: boolean
    jobId: string
    codeFiles: CodeFileList
    proposalHref: Route
    onCollapse: () => void
}

const SubmittedCodePanel: FC<SubmittedCodePanelProps> = ({ expanded, jobId, codeFiles, proposalHref, onCollapse }) => {
    return (
        <Collapse in={expanded}>
            <Paper p="xxl">
                <Stack gap="md">
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Title order={3} size="h5">
                            Submitted code
                        </Title>
                        <LinkWithIcon
                            href={proposalHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            icon={<ArrowSquareOutIcon size={14} />}
                            data-testid="view-approved-initial-request"
                        >
                            View approved initial request
                        </LinkWithIcon>
                    </Group>
                    <Divider />
                    <Text>View the code files that you uploaded to run against the dataset.</Text>
                    <SubmittedCodeTable jobId={jobId} files={codeFiles} />
                    <StudyCodeToggle expanded onClick={onCollapse} testId="study-code-toggle-collapse" />
                </Stack>
            </Paper>
        </Collapse>
    )
}

export function CodePostDecisionView({
    orgSlug,
    study,
    job,
    entries,
    reviewingOrgName,
    returnTo,
    latestJobStatus,
    nav,
    feedbackLoadError = false,
}: CodePostDecisionViewProps) {
    const { timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })
    const copy = researcherCodeDecisionBanner(latestJobStatus, { dataPartner: displayOrgName(reviewingOrgName) })
    const { expanded, toggle, collapse } = useExpandable()

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id, returnTo })

    const banner = <DecisionBanner copy={copy} decidedAt={timestampDate} />

    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader study={study} />

            <Stack gap="xxl">
                <StepCard study={study} banner={banner} expanded={expanded} onToggle={toggle} />
                <SubmittedCodePanel
                    expanded={expanded}
                    jobId={job.id}
                    codeFiles={codeFiles}
                    proposalHref={proposalHref}
                    onCollapse={collapse}
                />
                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <StepNavigation nav={nav} />
            </Stack>
        </Stack>
    )
}
