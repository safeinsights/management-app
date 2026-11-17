import { FC, ReactNode } from 'react'
import { Divider, Paper, Stack, Title } from '@mantine/core'
import { CodeRunTitle } from '@/components/study/code-run-title'
import { fontWeight, semanticColor } from '@/theme/tokens'

type CodeRunCardProps = {
    date: Date | string | null
    children: ReactNode
}

// The latest run's card. Its header stays while the sections inside change, before and after decrypt.
// The caller picks the date: the DP dates a run by when it ended, the RL by when the DP released it.
export const CodeRunCard: FC<CodeRunCardProps> = ({ date, children }) => (
    <Paper p="xxl" data-testid="code-run-card">
        <Stack gap="lg">
            <Title fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')} order={3}>
                <CodeRunTitle value={date} />
            </Title>
            <Divider />
            <Stack gap="xxl">{children}</Stack>
        </Stack>
    </Paper>
)
