'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { Routes } from '@/lib/routes'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'

type PostFeedbackViewProps = {
    orgSlug: string
    study: SelectedStudy
    entries: ProposalFeedbackEntry[]
}

type DecisionCopy = {
    timestampLabel: string
    banner: { bg: string; testId: string; copy: string }
}

const DECISION_COPY: Record<ReviewDecision, DecisionCopy> = {
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

function DecisionBanner({ decision }: { decision: ReviewDecision }) {
    const { banner } = DECISION_COPY[decision]
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

export function PostFeedbackView({ orgSlug, study, entries }: PostFeedbackViewProps) {
    const latest = entries[0]
    if (!latest || latest.decision === null) {
        return null
    }

    const decision = latest.decision
    const { timestampLabel } = DECISION_COPY[decision]

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.orgDashboard({ orgSlug })],
                        ['Study proposal'],
                        ['Review initial request'],
                    ]}
                />
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel="STEP 1"
                    heading="Review initial request"
                    statusBadge={timestampLabel}
                    timestampDate={latest.createdAt}
                    banner={<DecisionBanner decision={decision} />}
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
