'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { Routes } from '@/lib/routes'
import { STATUS_BANNER_BG } from '@/lib/status-banner-colors'
import { type Submitted } from '@/schema/study'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import type { CodeReviewFeedbackEntry, ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { JobScanResult, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
import { CollapsibleSubmittedCodeSection } from './collapsible-submitted-code-section'

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
    /**
     * Set only on the read-only /review/code walk-back step (OTTER-643) to render a "Previous" link back
     * through the flow. Omitted for the live code-decision screen and every proposal usage, which show
     * only "Go to dashboard" (matching the live DO design, which hides Previous).
     */
    previousHref?: Route
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
            bg: STATUS_BANNER_BG.approved,
            testId: 'decision-banner-approved',
            copy: "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Clarification requested on',
        banner: {
            bg: STATUS_BANNER_BG.changesRequestedReviewer,
            testId: 'decision-banner-clarification',
            copy: 'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: STATUS_BANNER_BG.rejected,
            testId: 'decision-banner-rejected',
            copy: 'This initial request has been rejected. No further action is required at this time.',
        },
    },
}

const CODE_DECISION_COPY: Partial<Record<ReviewDecision, DecisionCopy>> = {
    APPROVE: {
        timestampLabel: 'Approved on',
        banner: {
            bg: STATUS_BANNER_BG.approved,
            testId: 'decision-banner-code-approved',
            copy: 'This study code has been approved. You will be notified when the study results are available for review.',
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Change requested on',
        banner: {
            bg: STATUS_BANNER_BG.changesRequestedReviewer,
            testId: 'decision-banner-code-change-requested',
            copy: 'You have requested changes or more information about the study code. The researcher has been notified, and you will be notified once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: STATUS_BANNER_BG.rejected,
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

function PreviousButton({ href }: { href: Route }) {
    const router = useRouter()
    return (
        <Button
            variant="subtle"
            leftSection={<CaretLeftIcon />}
            onClick={() => router.push(href)}
            data-testid="post-feedback-previous"
        >
            Previous
        </Button>
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
    previousHref,
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
                <CollapsibleSubmittedCodeSection
                    isVisible={isCode}
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    review={review}
                    scan={scan}
                    stepLabel={kindCopy.stepLabel}
                    heading={kindCopy.heading}
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
                <Group justify={previousHref ? 'space-between' : 'flex-end'}>
                    {previousHref && <PreviousButton href={previousHref} />}
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
