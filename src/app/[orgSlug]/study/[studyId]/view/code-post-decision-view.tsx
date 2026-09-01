'use client'

import { type FC, type ReactNode } from 'react'
import type { Route } from 'next'
import { Box, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
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
import { STATUS_BANNER_BG } from '@/lib/status-banner-colors'
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

type DecisionCopy = {
    timestampLabel: string
    bannerBg: string
    bannerTestId: string
    banner: (orgName: string) => string
}

const DECISION_COPY: Record<CodeDecisionStatus, DecisionCopy> = {
    'CODE-APPROVED': {
        timestampLabel: 'Approved on',
        bannerBg: STATUS_BANNER_BG.approved,
        bannerTestId: 'decision-banner-code-approved',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has reviewed and approved your study code. Your code will now proceed to run in the secure enclave.`,
    },
    'CODE-CHANGES-REQUESTED': {
        timestampLabel: 'Change requested on',
        bannerBg: STATUS_BANNER_BG.changesRequestedResearcher,
        bannerTestId: 'decision-banner-code-change-requested',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your code and has requested information and/or changes. Please review the feedback below. You can update your code and resubmit it to address their comments.`,
    },
    'CODE-REJECTED': {
        timestampLabel: 'Rejected on',
        bannerBg: STATUS_BANNER_BG.rejected,
        bannerTestId: 'decision-banner-code-rejected',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has determined this code does not meet the requirements to proceed. Please review their feedback below. No further code submissions will be accepted for this study, but you may submit a new study proposal. If you believe this decision was made in error, contact SafeInsights.`,
    },
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
        copy: DECISION_COPY[decision],
        timestampDate: job.statusChanges.find((s) => s.status === decision)?.createdAt ?? entries[0]?.createdAt ?? null,
        codeFiles: filterAndOrderCodeFiles(job.files),
    }
}

const DecisionBanner: FC<{ copy: DecisionCopy; reviewingOrgName: string }> = ({ copy, reviewingOrgName }) => (
    <Box bg={copy.bannerBg} p="md" bdrs="sm" my="md" data-testid={copy.bannerTestId}>
        <Text c="charcoal.9" size="sm">
            {copy.banner(reviewingOrgName)}
        </Text>
    </Box>
)

type StepCardProps = {
    study: Submitted<SelectedStudy>
    copy: DecisionCopy
    timestampDate: Date | string | null
    banner: ReactNode
    expanded: boolean
    onToggle: () => void
}

function StepCard({ study, copy, timestampDate, banner, expanded, onToggle }: StepCardProps) {
    return (
        <ProposalStepHeader
            stepLabel="STEP 4"
            heading="Study code"
            studyTitle={study.title}
            timestampLabel={copy.timestampLabel}
            timestampDate={timestampDate}
            banner={banner}
        >
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
    const { copy, timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })
    const { expanded, toggle, collapse } = useExpandable()

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id, returnTo })

    const banner = <DecisionBanner copy={copy} reviewingOrgName={reviewingOrgName} />

    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader>Study proposal</StudyPageHeader>

            <Stack gap="xxl">
                <StepCard
                    study={study}
                    copy={copy}
                    timestampDate={timestampDate}
                    banner={banner}
                    expanded={expanded}
                    onToggle={toggle}
                />
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
