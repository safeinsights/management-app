import type { CodeSummaryQuestion } from '@/server/claude/code-summary'
import type { Json } from '@/database/types'
import { Divider, Stack, Text, Title } from '@mantine/core'

type CodeSummarySectionProps = {
    summary: Json | null | undefined
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

    const questions = summary as unknown as CodeSummaryQuestion[]

    return (
        <Stack>
            <Title order={4} size="xl">
                Code Summary
            </Title>
            <Divider c="dimmed" />
            {questions.map((q) => (
                <Stack key={q.id} gap="xs">
                    <Text fw={600} size="sm">
                        {q.question}
                    </Text>
                    <Text size="sm">{q.answer}</Text>
                </Stack>
            ))}
        </Stack>
    )
}
