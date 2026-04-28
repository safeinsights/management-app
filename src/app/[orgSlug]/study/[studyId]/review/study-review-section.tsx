'use client'

import { useQuery } from '@/common'
import { getStudyReviewAction } from '@/server/actions/study-job.actions'
import type { StudyReviewWithMeta } from '@/server/db/queries'
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
        return (
            <Stack>
                <Title order={4} size="xl">
                    Study Review
                </Title>
                <Divider c="dimmed" />
                <Group gap="xs">
                    <Loader size="sm" />
                    <Text c="dimmed" size="sm">
                        Review in progress…
                    </Text>
                </Group>
            </Stack>
        )
    }

    const { report, generatedAt, files } = review
    const fileNames = files.map((f) => f.name).join(', ')
    // ISO format avoids server/client locale or timezone hydration mismatch.
    const generatedAtLabel = new Date(generatedAt).toISOString()

    return (
        <Stack>
            <Title order={4} size="xl">
                Study Review
            </Title>
            <Divider c="dimmed" />

            <Stack gap={2}>
                <Text c="dimmed" size="xs">
                    Generated {generatedAtLabel}
                </Text>
                <Text c="dimmed" size="xs">
                    Files reviewed: {fileNames || '(none)'}
                </Text>
            </Stack>

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Proposal summary
                </Text>
                <Text size="sm">{report.proposalSummary}</Text>
            </Stack>

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Code explanation
                </Text>
                <Text size="sm">{report.codeExplanation}</Text>
            </Stack>

            {report.resultsSummary ? (
                <Stack gap="xs">
                    <Text fw={600} size="sm">
                        Results summary
                    </Text>
                    <Text size="sm">{report.resultsSummary}</Text>
                </Stack>
            ) : null}

            <Stack gap="xs">
                <Group gap="xs">
                    <Text fw={600} size="sm">
                        Alignment check
                    </Text>
                    <Badge color={report.alignmentCheck.isAligned ? 'green' : 'red'}>
                        {report.alignmentCheck.isAligned ? 'Aligned' : 'Misaligned'}
                    </Badge>
                </Group>
                {report.alignmentCheck.findings.length > 0 ? (
                    <List size="sm">
                        {report.alignmentCheck.findings.map((finding, i) => (
                            <ListItem key={i}>{finding}</ListItem>
                        ))}
                    </List>
                ) : (
                    <Text c="dimmed" size="sm">
                        No findings
                    </Text>
                )}
            </Stack>

            <Stack gap="xs">
                <Group gap="xs">
                    <Text fw={600} size="sm">
                        Compliance check
                    </Text>
                    <Badge color={report.complianceCheck.isCompliant ? 'green' : 'red'}>
                        {report.complianceCheck.isCompliant ? 'Compliant' : 'Non-compliant'}
                    </Badge>
                </Group>
                {report.complianceCheck.findings.length > 0 ? (
                    <List size="sm">
                        {report.complianceCheck.findings.map((finding, i) => (
                            <ListItem key={i}>{finding}</ListItem>
                        ))}
                    </List>
                ) : (
                    <Text c="dimmed" size="sm">
                        No findings
                    </Text>
                )}
            </Stack>
        </Stack>
    )
}
