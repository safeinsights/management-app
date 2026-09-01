'use client'

import { type FC, type ReactNode } from 'react'
import type { Route } from 'next'
import { Box, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink, LinkWithIcon } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
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

type CodeFileList = LatestJobForStudy['files']

interface CodePostDecisionViewProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    reviewingOrgName: string
    dashboardHref: Route
    returnTo?: 'org'
    latestJobStatus: CodeDecisionStatus
    // Set only when /view resolves past this screen (OTTER-614, OTTER-687).
    nextStepHref?: Route
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

type DecisionActionsProps = {
    decision: CodeDecisionStatus
    previousHref: Route
    dashboardHref: Route
    resubmitHref: Route
    nextStepHref?: Route
}

const DashboardAction: FC<{ isVisible: boolean; href: Route }> = ({ isVisible, href }) => {
    if (!isVisible) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-go-to-dashboard">
            Go to dashboard
        </ButtonLink>
    )
}

const NextStepAction: FC<{ isVisible: boolean; href?: Route }> = ({ isVisible, href }) => {
    if (!isVisible || !href) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-next-step">
            Next step
        </ButtonLink>
    )
}

const EditAndResubmitAction: FC<{ isVisible: boolean; href: Route }> = ({ isVisible, href }) => {
    if (!isVisible) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-edit-and-resubmit">
            Edit and resubmit
        </ButtonLink>
    )
}

function DecisionActions({ decision, previousHref, dashboardHref, resubmitHref, nextStepHref }: DecisionActionsProps) {
    const showResubmit = decision === 'CODE-CHANGES-REQUESTED'
    // Resubmit outranks the forward link: a change request is the flow, not a step to skip.
    const showNextStep = !showResubmit && !!nextStepHref
    return (
        <Group justify="space-between">
            <PreviousStepLink previousHref={previousHref} />
            <NextStepAction isVisible={showNextStep} href={nextStepHref} />
            <DashboardAction isVisible={!showResubmit && !showNextStep} href={dashboardHref} />
            <EditAndResubmitAction isVisible={showResubmit} href={resubmitHref} />
        </Group>
    )
}

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
    dashboardHref,
    returnTo,
    latestJobStatus,
    nextStepHref,
    feedbackLoadError = false,
}: CodePostDecisionViewProps) {
    const { copy, timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })
    const { expanded, toggle, collapse } = useExpandable()

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id, returnTo })
    // OTTER-727 hid Agreements; "Previous step" now walks straight to the approved proposal.
    const previousHref = proposalHref
    const resubmitHref = Routes.studyResubmit({ orgSlug, studyId: study.id })

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
                <DecisionActions
                    decision={latestJobStatus}
                    previousHref={previousHref}
                    dashboardHref={dashboardHref}
                    resubmitHref={resubmitHref}
                    nextStepHref={nextStepHref}
                />
            </Stack>
        </Stack>
    )
}
