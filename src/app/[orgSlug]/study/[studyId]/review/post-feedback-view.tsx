'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { Routes } from '@/lib/routes'
import { type Submitted } from '@/schema/study'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { CodeReviewFeedbackEntry, ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { JobScanResult, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
import { SubmittedCodeSection } from './submitted-code-section'
import { StudyCodeToggle } from './submitted-code-interactive'
import { useExpandable } from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'

export type PostFeedbackKind = 'PROPOSAL' | 'CODE'

type PostFeedbackViewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: ProposalFeedbackEntry[] | CodeReviewFeedbackEntry[]
    kind?: PostFeedbackKind
    job?: LatestJobForStudy | null
    /** AI summary + security scan, fetched alongside the job for the CODE post-decision section. */
    review?: StudyReviewWithMeta | null
    scan?: JobScanResult | null
    /**
     * Render the decision banner + timestamp from this when `entries` carries no decision. Proposal
     * approve/reject can write a CODE-* job status without a code-review comment, so the page would
     * otherwise blank out; the fallback keeps the code decision page.
     */
    fallback?: {
        decision: ReviewDecision
        timestamp: Date | string
    }
}

type DecisionCopy = {
    timestampLabel: string
    banner: { bg: string; testId: string; copy: string }
}

type KindCopy = {
    heading: string
    crumbLast: string
    stepLabel: string
    decisionCopy: Partial<Record<ReviewDecision, DecisionCopy>>
}

const PROPOSAL_DECISION_COPY: Record<ReviewDecision, DecisionCopy> = {
    APPROVE: {
        timestampLabel: 'Approved on',
        banner: {
            bg: 'green.1',
            testId: 'decision-banner-approved',
            copy: "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Clarification requested on',
        banner: {
            bg: 'yellow.1',
            testId: 'decision-banner-clarification',
            copy: 'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: 'red.1',
            testId: 'decision-banner-rejected',
            copy: 'This initial request has been rejected. No further action is required at this time.',
        },
    },
}

const CODE_DECISION_COPY: Partial<Record<ReviewDecision, DecisionCopy>> = {
    APPROVE: {
        timestampLabel: 'Approved on',
        banner: {
            bg: 'green.1',
            testId: 'decision-banner-code-approved',
            copy: 'This study code has been approved. You will be notified when the study results are available for review.',
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Change requested on',
        banner: {
            bg: 'yellow.1',
            testId: 'decision-banner-code-change-requested',
            copy: 'You have requested changes or more information about the study code. The researcher has been notified, and you will be notified once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: 'red.1',
            testId: 'decision-banner-code-rejected',
            copy: 'This study code was rejected and the study was ended. No further action is required at this time.',
        },
    },
}

const COPY_BY_KIND: Record<PostFeedbackKind, KindCopy> = {
    PROPOSAL: {
        heading: 'Review initial request',
        crumbLast: 'Review initial request',
        stepLabel: 'STEP 1',
        decisionCopy: PROPOSAL_DECISION_COPY,
    },
    CODE: {
        heading: 'Review study code',
        crumbLast: 'Review study code',
        stepLabel: 'STEP 3',
        decisionCopy: CODE_DECISION_COPY,
    },
}

function DecisionBanner({ decision, kind }: { decision: ReviewDecision; kind: PostFeedbackKind }) {
    const copy = COPY_BY_KIND[kind].decisionCopy[decision]
    if (!copy) return null
    const { banner } = copy
    return (
        <Box bg={banner.bg} p="md" bdrs="sm" my="md" data-testid={banner.testId}>
            <Text c="charcoal.9" size="sm">
                {banner.copy}
            </Text>
        </Box>
    )
}

function GoToDashboardButton() {
    const router = useRouter()
    const handleClick = () => router.push(Routes.dashboard)
    return (
        <Button onClick={handleClick} data-testid="go-to-dashboard">
            Go to dashboard
        </Button>
    )
}

type SubmittedCodePanelProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy | null
    review: StudyReviewWithMeta | null
    scan: JobScanResult | null
    expanded: boolean
    onCollapse: () => void
}

// The full "Submitted code" section (datasets, AI summary, security scan log, code viewer) is the
// same one shown during active review. Per OTTER-613 the entire card is hidden when collapsed and
// revealed via the "View full study code" toggle in the step card, so it only mounts when expanded;
// its own toggle then reads "Hide full study code" and calls onCollapse to close the whole card.
function SubmittedCodePanel({ orgSlug, study, job, review, scan, expanded, onCollapse }: SubmittedCodePanelProps) {
    // scan-presence is coupled to job-presence: the caller fetches both together and
    // jobScanResultForJob never returns null (it falls back to {status:'IN-PROGRESS', logFile:null}),
    // so scan is null exactly when job is null. The !scan check is the type-narrowing that lets us
    // pass a non-null scan to SubmittedCodeSection; in practice it only fires on the null-job branch.
    if (!job || !scan) return null
    if (!expanded) return null
    return (
        <SubmittedCodeSection
            orgSlug={orgSlug}
            study={study}
            job={job}
            review={review}
            scan={scan}
            onCollapse={onCollapse}
        />
    )
}

type CodeSectionProps = {
    isVisible: boolean
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy | null
    review: StudyReviewWithMeta | null
    scan: JobScanResult | null
    kindCopy: KindCopy
    timestampLabel: string
    timestampDate: Date | string | null
    banner: ReactNode
}

function CodeSection({
    isVisible,
    orgSlug,
    study,
    job,
    review,
    scan,
    kindCopy,
    timestampLabel,
    timestampDate,
    banner,
}: CodeSectionProps) {
    const { expanded, toggle, collapse } = useExpandable()
    if (!isVisible) return null
    // Only offer the opener when there is a Submitted code panel behind it. SubmittedCodePanel
    // returns null without a job/scan (e.g. the fallback auto-approved page), so an unconditional
    // opener would otherwise expand to an empty card with no way back.
    const hasSubmittedCode = Boolean(job && scan)
    return (
        <>
            <ProposalStepHeader
                stepLabel={kindCopy.stepLabel}
                heading={kindCopy.heading}
                studyTitle={study.title}
                timestampDate={timestampDate}
                timestampLabel={timestampLabel}
                banner={banner}
            >
                <StudyCodeToggle isVisible={!expanded && hasSubmittedCode} isExpanded={false} onClick={toggle} />
            </ProposalStepHeader>
            <SubmittedCodePanel
                orgSlug={orgSlug}
                study={study}
                job={job}
                review={review}
                scan={scan}
                expanded={expanded}
                onCollapse={collapse}
            />
        </>
    )
}

type ProposalSectionProps = {
    isVisible: boolean
    study: Submitted<SelectedStudy>
    orgSlug: string
    kindCopy: KindCopy
    entries: ProposalFeedbackEntry[]
    timestampLabel: string
    banner: ReactNode
}

function ProposalSection({
    isVisible,
    study,
    orgSlug,
    kindCopy,
    entries,
    timestampLabel,
    banner,
}: ProposalSectionProps) {
    if (!isVisible) return null
    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel={kindCopy.stepLabel}
            heading={kindCopy.heading}
            statusBadge={timestampLabel}
            entries={entries}
            banner={banner}
            initialExpanded={false}
        />
    )
}

function buildCrumbs({
    orgSlug,
    studyId,
    kind,
    crumbLast,
}: {
    orgSlug: string
    studyId: string
    kind: PostFeedbackKind
    crumbLast: string
}): Array<[string, string?]> {
    const dashboard: [string, string] = ['Dashboard', Routes.orgDashboard({ orgSlug })]
    const proposalCrumb: [string, string?] =
        kind === 'CODE' ? ['Study proposal', Routes.studySubmitted({ orgSlug, studyId })] : ['Study proposal']
    const current: [string] = [crumbLast]
    return [dashboard, proposalCrumb, current]
}

export function PostFeedbackView({
    orgSlug,
    study,
    entries,
    kind = 'PROPOSAL',
    job = null,
    review = null,
    scan = null,
    fallback,
}: PostFeedbackViewProps) {
    const latest = entries[0]
    const latestDecision = latest?.decision ?? null
    const decision = latestDecision ?? fallback?.decision ?? null
    if (decision === null) {
        return null
    }

    const kindCopy = COPY_BY_KIND[kind]
    const decisionCopy = kindCopy.decisionCopy[decision]
    const timestampLabel = decisionCopy?.timestampLabel ?? PROPOSAL_DECISION_COPY[decision].timestampLabel
    const timestampDate = latestDecision ? latest?.createdAt : (fallback?.timestamp ?? null)
    const crumbs = buildCrumbs({ orgSlug, studyId: study.id, kind, crumbLast: kindCopy.crumbLast })
    const banner = <DecisionBanner decision={decision} kind={kind} />
    const isCode = kind === 'CODE'

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs crumbs={crumbs} />
                <Title order={1} fz={40} fw={700}>
                    Study proposal
                </Title>
                <CodeSection
                    isVisible={isCode}
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    review={review}
                    scan={scan}
                    kindCopy={kindCopy}
                    timestampLabel={timestampLabel}
                    timestampDate={timestampDate}
                    banner={banner}
                />
                <ProposalSection
                    isVisible={!isCode}
                    study={study}
                    orgSlug={orgSlug}
                    kindCopy={kindCopy}
                    entries={isCode ? [] : (entries as ProposalFeedbackEntry[])}
                    timestampLabel={timestampLabel}
                    banner={banner}
                />
                <FeedbackAndNotesSection entries={entries} alwaysExpandLatest={isCode} />
                <Group justify="flex-end">
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
