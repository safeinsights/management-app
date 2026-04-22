import type { CodeSummaryItem } from '@/server/claude/code-summary'
import { Divider, Stack, Text, Title } from '@mantine/core'

type CodeSummarySectionProps = {
    summary: CodeSummaryItem[] | null
}

export function CodeSummarySection({ summary }: CodeSummarySectionProps) {
    if (!summary) {
        return (
            <Stack>
                <Title order={4} size="xl">
                    Code Summary
                </Title>
                <Divider c="dimmed" />
                <Text c="dimmed" size="sm">
                    Summary unavailable
                </Text>
            </Stack>
        )
    }

    return (
        <Stack>
            <Title order={4} size="xl">
                Code Summary
            </Title>
            <Divider c="dimmed" />
            {summary.map((item, i) => (
                <Stack key={i} gap="xs">
                    <Text fw={600} size="sm">
                        {item.question}
                    </Text>
                    <Text size="sm">{item.answer}</Text>
                </Stack>
            ))}
        </Stack>
    )
}
