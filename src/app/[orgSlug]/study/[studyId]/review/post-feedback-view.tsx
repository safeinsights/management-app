'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { Routes } from '@/lib/routes'
import { Box, Button, Divider, Group, Stack, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { ProposalSection } from './proposal-section'

type PostFeedbackViewProps = {
    orgSlug: string
    study: SelectedStudy
    entries: ProposalFeedbackEntry[]
}

type DecisionCopy = {
    timestampLabel: string
    banner: { bg: string; color: string; testId: string; copy: string }
}

const DECISION_COPY: Record<ReviewDecision, DecisionCopy> = {
    APPROVE: {
        timestampLabel: 'Approved',
        banner: {
            bg: 'green.1',
            color: 'green.8',
            testId: 'decision-banner-approved',
            copy: "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Clarification requested',
        banner: {
            bg: 'yellow.1',
            color: 'yellow.9',
            testId: 'decision-banner-clarification',
            copy: 'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected',
        banner: {
            bg: 'red.1',
            color: 'red.8',
            testId: 'decision-banner-rejected',
            copy: 'This initial request has been rejected. No further action is required at this time.',
        },
    },
}

function formatDate(date: Date | string): string {
    return dayjs(date).format('MMM DD, YYYY')
}

function DecisionBanner({ decision }: { decision: ReviewDecision }) {
    const { banner } = DECISION_COPY[decision]
    return (
        <Box bg={banner.bg} p="md" bdrs="sm" data-testid={banner.testId}>
            <Text c={banner.color} size="sm">
                {banner.copy}
            </Text>
        </Box>
    )
}

function FullProposalDropdown({ orgSlug, study }: { orgSlug: string; study: SelectedStudy }) {
    return <ProposalSection orgSlug={orgSlug} study={study} initialExpanded={false} />
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

type DecisionHeaderProps = {
    study: SelectedStudy
    decision: ReviewDecision
    decidedAt: Date | string
}

function DecisionHeader({ study, decision, decidedAt }: DecisionHeaderProps) {
    const copy = DECISION_COPY[decision]
    const date = formatDate(decidedAt)

    return (
        <Stack gap="md" data-testid="decision-header">
            <Stack gap={4}>
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <Text fz={20} fw={600}>
                    Review initial request
                </Text>
                <Text size="sm">Title: {study.title}</Text>
                <Text size="sm" c="gray.7" data-testid="decision-timestamp">
                    {copy.timestampLabel} on {date}
                </Text>
            </Stack>
            <Divider />
        </Stack>
    )
}

export function PostFeedbackView({ orgSlug, study, entries }: PostFeedbackViewProps) {
    const latest = entries[0]
    if (!latest || latest.decision === null) {
        return null
    }

    const decision = latest.decision

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs crumbs={[['Dashboard', Routes.orgDashboard({ orgSlug })], ['Study proposal']]} />
                <DecisionHeader study={study} decision={decision} decidedAt={latest.createdAt} />
                <DecisionBanner decision={decision} />
                <FullProposalDropdown orgSlug={orgSlug} study={study} />
                <FeedbackAndNotesSection entries={entries} />
                <Group justify="flex-end">
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
