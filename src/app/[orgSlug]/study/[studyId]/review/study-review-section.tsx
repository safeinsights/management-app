'use client'

import { useQuery } from '@/common'
import { getStudyReviewAction } from '@/server/actions/study-job.actions'
import type { StudyReviewWithMeta } from '@/server/db/queries'
import type { AnalysisReport } from '@/server/agents/review-agent/types'
import { Badge, Divider, Group, List, ListItem, Loader, Stack, Text, Title } from '@mantine/core'

const POLL_INTERVAL_MS = 5_000

type StudyReviewSectionProps = {
    studyJobId: string
    initialReview: StudyReviewWithMeta | null
}

export function StudyReviewSection({ studyJobId, initialReview }: StudyReviewSectionProps) {
    const { data: review } = useQuery({
        queryKey: ['study-review', studyJobId],
        queryFn: () => getStudyReviewAction({ studyJobId }),
        initialData: initialReview,
        // Poll while review is still pending; stop once the row arrives.
        refetchInterval: (query) => (query.state.data ? false : POLL_INTERVAL_MS),
    })

    if (!review) {
        return <ReviewInProgress />
    }

    return <ReviewReport review={review} />
}

function ReviewInProgress() {
    return (
        <Stack>
            <ReviewHeader />
            <Group gap="xs">
                <Loader size="sm" />
                <Text c="dimmed" size="sm">
                    Review in progress…
                </Text>
            </Group>
        </Stack>
    )
}

function ReviewHeader() {
    return (
        <>
            <Title order={4} size="xl">
                Study Review
            </Title>
            <Divider c="dimmed" />
        </>
    )
}

function ReviewReport({ review }: { review: StudyReviewWithMeta }) {
    const { report, generatedAt, files } = review
    const fileNames = files.map((f) => f.name).join(', ') || '(none)'
    const generatedAtLabel = new Date(generatedAt).toISOString()

    return (
        <Stack>
            <ReviewHeader />
            <ReviewMetadata generatedAtLabel={generatedAtLabel} fileNames={fileNames} />
            <TextSection title="Proposal summary" body={report.proposalSummary} />
            <TextSection title="Code explanation" body={report.codeExplanation} />
            <TextSection
                title="Results summary"
                body={report.resultsSummary}
                isVisible={Boolean(report.resultsSummary)}
            />
            <CheckSection
                title="Alignment check"
                isPositive={report.alignmentCheck.isAligned}
                positiveLabel="Aligned"
                negativeLabel="Misaligned"
                findings={report.alignmentCheck.findings}
            />
            <CheckSection
                title="Compliance check"
                isPositive={report.complianceCheck.isCompliant}
                positiveLabel="Compliant"
                negativeLabel="Non-compliant"
                findings={report.complianceCheck.findings}
            />
        </Stack>
    )
}

function ReviewMetadata({ generatedAtLabel, fileNames }: { generatedAtLabel: string; fileNames: string }) {
    return (
        <Stack gap={2}>
            <Text c="dimmed" size="xs">
                Generated {generatedAtLabel}
            </Text>
            <Text c="dimmed" size="xs">
                Files reviewed: {fileNames}
            </Text>
        </Stack>
    )
}

type TextSectionProps = {
    title: string
    body?: string
    isVisible?: boolean
}

function TextSection({ title, body, isVisible = true }: TextSectionProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">
                {title}
            </Text>
            <Text size="sm">{body}</Text>
        </Stack>
    )
}

type CheckSectionProps = {
    title: string
    isPositive: boolean
    positiveLabel: string
    negativeLabel: string
    findings: AnalysisReport['alignmentCheck']['findings']
}

function CheckSection({ title, isPositive, positiveLabel, negativeLabel, findings }: CheckSectionProps) {
    const badgeColor = isPositive ? 'green' : 'red'
    const badgeLabel = isPositive ? positiveLabel : negativeLabel

    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text fw={600} size="sm">
                    {title}
                </Text>
                <Badge color={badgeColor}>{badgeLabel}</Badge>
            </Group>
            <FindingsList findings={findings} />
        </Stack>
    )
}

function FindingsList({ findings }: { findings: string[] }) {
    if (findings.length === 0) {
        return (
            <Text c="dimmed" size="sm">
                No findings
            </Text>
        )
    }
    return (
        <List size="sm">
            {findings.map((finding, i) => (
                <ListItem key={i}>{finding}</ListItem>
            ))}
        </List>
    )
}
