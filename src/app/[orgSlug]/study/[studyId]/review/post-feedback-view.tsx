'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { Routes } from '@/lib/routes'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { CodeReviewFeedbackEntry, ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'

export type PostFeedbackKind = 'PROPOSAL' | 'CODE'

type PostFeedbackViewProps = {
    orgSlug: string
    study: SelectedStudy
    entries: ProposalFeedbackEntry[] | CodeReviewFeedbackEntry[]
    kind?: PostFeedbackKind
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
            copy: 'This study code has been approved. No further edits are allowed at this point.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: 'red.1',
            testId: 'decision-banner-code-rejected',
            copy: 'This study code has been rejected. No further action is required at this time.',
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

export function PostFeedbackView({ orgSlug, study, entries, kind = 'PROPOSAL' }: PostFeedbackViewProps) {
    const latest = entries[0]
    if (!latest || latest.decision === null) {
        return null
    }

    const decision = latest.decision
    const kindCopy = COPY_BY_KIND[kind]
    const decisionCopy = kindCopy.decisionCopy[decision]
    const timestampLabel = decisionCopy?.timestampLabel ?? PROPOSAL_DECISION_COPY[decision].timestampLabel

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[['Dashboard', Routes.orgDashboard({ orgSlug })], ['Study proposal'], [kindCopy.crumbLast]]}
                />
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel={kindCopy.stepLabel}
                    heading={kindCopy.heading}
                    statusBadge={timestampLabel}
                    entries={kind === 'PROPOSAL' ? (entries as ProposalFeedbackEntry[]) : []}
                    banner={<DecisionBanner decision={decision} kind={kind} />}
                    initialExpanded={false}
                />
                <FeedbackAndNotesSection entries={entries} />
                <Group justify="flex-end">
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
