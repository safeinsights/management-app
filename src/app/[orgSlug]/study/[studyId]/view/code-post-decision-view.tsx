'use client'

import { type FC, type ReactNode } from 'react'
import type { Route } from 'next'
import { Anchor, Box, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOut, CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SubmittedCodeTable } from '@/components/study/submitted-code-table'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { StudyCodeToggle, useExpandable } from './study-code-collapse'
import { displayOrgName } from '@/lib/string'
import { Routes } from '@/lib/routes'
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
    /** Org-scoped entry: threaded onto the "Previous step" → researcher agreements link so org scope survives. */
    returnTo?: 'org'
    latestJobStatus: CodeDecisionStatus
    /**
     * Forward link to results (Step 5); set only once results exist. When set, the primary action
     * reads "Proceed to step 5" instead of "Go to dashboard" (OTTER-614).
     */
    resultsHref?: Route
    /** When the reviewer-feedback fetch failed, show an inline notice instead of the feedback section. */
    feedbackLoadError?: boolean
    /**
     * Hidden during the execution window (approved code running in the enclave) so the page reads as
     * "running / results pending" with no code listing, per OTTER-598. Shown for plain code decisions.
     */
    showStudyCode?: boolean
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
        bannerBg: 'green.1',
        bannerTestId: 'decision-banner-code-approved',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has reviewed and approved your study code. Your code will now proceed to run in the secure enclave.`,
    },
    'CODE-CHANGES-REQUESTED': {
        timestampLabel: 'Change requested on',
        bannerBg: 'purple.1',
        bannerTestId: 'decision-banner-code-change-requested',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your code and has requested information and/or changes. Please review the feedback below. You can update your code and resubmit it to address their comments.`,
    },
    'CODE-REJECTED': {
        timestampLabel: 'Rejected on',
        bannerBg: 'red.1',
        bannerTestId: 'decision-banner-code-rejected',
        banner: (orgName) =>
            `${displayOrgName(orgName)} has determined this code does not meet the requirements to proceed. Please review their feedback below. No further code submissions will be accepted for this study, but you may submit a new study proposal. If you believe this decision was made in error, contact SafeInsights.`,
    },
}

// Date is sourced from the decision's own status-change row so it stays correct (and present)
// even when feedback entries are empty or belong to a different review round.
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
    resultsHref?: Route
}

const PreviousStepLink: FC<{ href: Route }> = ({ href }) => (
    <ButtonLink href={href} variant="subtle" leftSection={<CaretLeftIcon />}>
        Previous step
    </ButtonLink>
)

const DashboardAction: FC<{ isVisible: boolean; href: Route }> = ({ isVisible, href }) => {
    if (!isVisible) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-go-to-dashboard">
            Go to dashboard
        </ButtonLink>
    )
}

const ProceedToResultsAction: FC<{ isVisible: boolean; href?: Route }> = ({ isVisible, href }) => {
    if (!isVisible || !href) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-proceed-to-results">
            Proceed to step 5
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

function DecisionActions({ decision, previousHref, dashboardHref, resubmitHref, resultsHref }: DecisionActionsProps) {
    const showResubmit = decision === 'CODE-CHANGES-REQUESTED'
    // Once results exist, continue forward to Step 5 instead of ending at the dashboard.
    const showProceedToResults = !showResubmit && !!resultsHref
    return (
        <Group justify="space-between">
            <PreviousStepLink href={previousHref} />
            <ProceedToResultsAction isVisible={showProceedToResults} href={resultsHref} />
            <DashboardAction isVisible={!showResubmit && !showProceedToResults} href={dashboardHref} />
            <EditAndResubmitAction isVisible={showResubmit} href={resubmitHref} />
        </Group>
    )
}

// Reviewer feedback could not be loaded. Degrade gracefully with the shared not-found notice
// (same as the DO review page) in place of the feedback section, rather than a legacy view.
const FeedbackSection: FC<{ feedbackLoadError: boolean; entries: CodeReviewFeedbackEntry[] }> = ({
    feedbackLoadError,
    entries,
}) => {
    if (feedbackLoadError) {
        return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    }
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

type StepCardProps = {
    study: Submitted<SelectedStudy>
    copy: DecisionCopy
    timestampDate: Date | string | null
    banner: ReactNode
    showToggle: boolean
    expanded: boolean
    onToggle: () => void
}

function StepCard({ study, copy, timestampDate, banner, showToggle, expanded, onToggle }: StepCardProps) {
    return (
        <ProposalStepHeader
            stepLabel="STEP 4"
            heading="Study code"
            studyTitle={study.title}
            timestampLabel={copy.timestampLabel}
            timestampDate={timestampDate}
            banner={banner}
        >
            <StudyCodeToggle isVisible={showToggle} expanded={expanded} onClick={onToggle} />
        </ProposalStepHeader>
    )
}

// Broken out into its own card per design (OTTER-590): collapsed, only the in-step toggle shows; expanded,
// this card reveals the proposal link, file table, and the matching "Hide" toggle.
type SubmittedCodePanelProps = {
    isVisible: boolean
    expanded: boolean
    jobId: string
    codeFiles: CodeFileList
    proposalHref: Route
    onCollapse: () => void
}

const SubmittedCodePanel: FC<SubmittedCodePanelProps> = ({
    isVisible,
    expanded,
    jobId,
    codeFiles,
    proposalHref,
    onCollapse,
}) => {
    if (!isVisible) return null
    return (
        <Collapse in={expanded}>
            <Paper p="xxl">
                <Stack gap="md">
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Title order={5}>Submitted code</Title>
                        <Anchor
                            href={proposalHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            fw={700}
                            display="inline-flex"
                            style={{ alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
                            data-testid="view-approved-initial-request"
                        >
                            View approved initial request
                            <ArrowSquareOut size={14} />
                        </Anchor>
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
    resultsHref,
    feedbackLoadError = false,
    showStudyCode = true,
}: CodePostDecisionViewProps) {
    const { copy, timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })
    const { expanded, toggle, collapse } = useExpandable()

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id })
    const previousHref = Routes.studyResearcherAgreements({ orgSlug, studyId: study.id, returnTo })
    const resubmitHref = Routes.studyResubmit({ orgSlug, studyId: study.id })

    const breadcrumbs: Array<[string, string?]> = [
        ['Dashboard', dashboardHref],
        ['Study proposal', proposalHref],
        ['Study code'],
    ]

    const banner = <DecisionBanner copy={copy} reviewingOrgName={reviewingOrgName} />

    return (
        <Stack p="xl" gap="xl">
            <PageBreadcrumbs crumbs={breadcrumbs} />
            <Title order={1}>Study proposal</Title>

            <Stack gap="xxl">
                <StepCard
                    study={study}
                    copy={copy}
                    timestampDate={timestampDate}
                    banner={banner}
                    showToggle={showStudyCode && !expanded}
                    expanded={expanded}
                    onToggle={toggle}
                />
                <SubmittedCodePanel
                    isVisible={showStudyCode}
                    expanded={expanded}
                    jobId={job.id}
                    codeFiles={codeFiles}
                    proposalHref={proposalHref}
                    onCollapse={collapse}
                />
                <FeedbackSection feedbackLoadError={feedbackLoadError} entries={entries} />
                <DecisionActions
                    decision={latestJobStatus}
                    previousHref={previousHref}
                    dashboardHref={dashboardHref}
                    resubmitHref={resubmitHref}
                    resultsHref={resultsHref}
                />
            </Stack>
        </Stack>
    )
}
