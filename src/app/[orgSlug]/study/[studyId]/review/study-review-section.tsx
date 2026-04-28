import type { AnalysisReport } from '@/server/review-agent'
import { Badge, Divider, List, Stack, Text, Title } from '@mantine/core'

type StudyReviewSectionProps = {
    review: AnalysisReport | null
}

export function StudyReviewSection({ review }: StudyReviewSectionProps) {
    if (!review) {
        return (
            <Stack>
                <Title order={4} size="xl">
                    Study Review
                </Title>
                <Divider c="dimmed" />
                <Text c="dimmed" size="sm">
                    Review unavailable
                </Text>
            </Stack>
        )
    }

    return (
        <Stack>
            <Title order={4} size="xl">
                Study Review
            </Title>
            <Divider c="dimmed" />

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Proposal summary
                </Text>
                <Text size="sm">{review.proposalSummary}</Text>
            </Stack>

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Code explanation
                </Text>
                <Text size="sm">{review.codeExplanation}</Text>
            </Stack>

            {review.resultsSummary ? (
                <Stack gap="xs">
                    <Text fw={600} size="sm">
                        Results summary
                    </Text>
                    <Text size="sm">{review.resultsSummary}</Text>
                </Stack>
            ) : null}

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Alignment check{' '}
                    <Badge color={review.alignmentCheck.isAligned ? 'green' : 'red'} ml="xs">
                        {review.alignmentCheck.isAligned ? 'Aligned' : 'Misaligned'}
                    </Badge>
                </Text>
                {review.alignmentCheck.findings.length > 0 ? (
                    <List size="sm">
                        {review.alignmentCheck.findings.map((finding, i) => (
                            <List.Item key={i}>{finding}</List.Item>
                        ))}
                    </List>
                ) : (
                    <Text c="dimmed" size="sm">
                        No findings
                    </Text>
                )}
            </Stack>

            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Compliance check{' '}
                    <Badge color={review.complianceCheck.isCompliant ? 'green' : 'red'} ml="xs">
                        {review.complianceCheck.isCompliant ? 'Compliant' : 'Non-compliant'}
                    </Badge>
                </Text>
                {review.complianceCheck.findings.length > 0 ? (
                    <List size="sm">
                        {review.complianceCheck.findings.map((finding, i) => (
                            <List.Item key={i}>{finding}</List.Item>
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
