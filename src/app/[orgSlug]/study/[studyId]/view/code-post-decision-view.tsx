'use client'

import type { FC, ReactNode } from 'react'
import type { Route } from 'next'
import { Box, Group, Stack, Text, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import {
    StudyCodeViewer,
    type StudyCodeToggleLabels,
} from '@/app/[orgSlug]/study/[studyId]/review/submitted-code-interactive'
import { filterAndOrderCodeFiles, type CodeFile } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { displayOrgName } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { type Submitted } from '@/schema/study'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { type CodeDecisionStatus } from '@/lib/study-job-status'

interface CodePostDecisionViewProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    reviewingOrgName: string
    dashboardHref: Route
    latestJobStatus: CodeDecisionStatus
}

type DecisionCopy = {
    timestampLabel: string
    bannerBg: string
    bannerTestId: string
    banner: (orgName: string) => string
}

const STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
    expand: 'View submitted study code',
    collapse: 'Hide submitted study code',
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

// Date is sourced from the feedback entry (not the job status row): the entry carries the
// user-visible "I submitted this decision at T" timestamp, while the status row may be
// written by a downstream worker on a slight delay.
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
        timestampDate: entries[0].createdAt,
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

const EditAndResubmitAction: FC<{ isVisible: boolean; href: Route }> = ({ isVisible, href }) => {
    if (!isVisible) return null
    return (
        <ButtonLink href={href} size="md" data-testid="cta-edit-and-resubmit">
            Edit and resubmit
        </ButtonLink>
    )
}

function DecisionActions({ decision, previousHref, dashboardHref, resubmitHref }: DecisionActionsProps) {
    const showResubmit = decision === 'CODE-CHANGES-REQUESTED'
    return (
        <Group justify="space-between">
            <PreviousStepLink href={previousHref} />
            <DashboardAction isVisible={!showResubmit} href={dashboardHref} />
            <EditAndResubmitAction isVisible={showResubmit} href={resubmitHref} />
        </Group>
    )
}

type StepCardProps = {
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    copy: DecisionCopy
    timestampDate: Date | string
    codeFiles: CodeFile[]
    banner: ReactNode
}

function StepCard({ study, job, copy, timestampDate, codeFiles, banner }: StepCardProps) {
    return (
        <ProposalStepHeader
            stepLabel="STEP 4"
            heading="Study code"
            studyTitle={study.title}
            timestampLabel={copy.timestampLabel}
            timestampDate={timestampDate}
            banner={banner}
        >
            <StudyCodeViewer
                studyJobId={job.id}
                files={codeFiles}
                initialExpanded={false}
                toggleLabels={STUDY_CODE_TOGGLE_LABELS}
            />
        </ProposalStepHeader>
    )
}

export function CodePostDecisionView({
    orgSlug,
    study,
    job,
    entries,
    reviewingOrgName,
    dashboardHref,
    latestJobStatus,
}: CodePostDecisionViewProps) {
    const { copy, timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id })
    const previousHref = Routes.studyAgreements({ orgSlug, studyId: study.id, from: 'previous' })
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
                    job={job}
                    copy={copy}
                    timestampDate={timestampDate}
                    codeFiles={codeFiles}
                    banner={banner}
                />
                <FeedbackAndNotesSection entries={entries} />
                <DecisionActions
                    decision={latestJobStatus}
                    previousHref={previousHref}
                    dashboardHref={dashboardHref}
                    resubmitHref={resubmitHref}
                />
            </Stack>
        </Stack>
    )
}
