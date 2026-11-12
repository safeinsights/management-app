import { FC, ReactNode } from 'react'
import { Divider, Paper, Stack, Title } from '@mantine/core'
import { CodeRunTitle } from '@/components/study/code-run-title'
import type { StudyJobStatus } from '@/database/types'
import { codeRunEndedAt } from '@/lib/outputs-review'
import { fontWeight, semanticColor } from '@/theme/tokens'

type CodeRunCardProps = {
    job: { statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }> }
    children: ReactNode
}

// The latest run's card. Its header stays while the sections inside change, before and after decrypt.
export const CodeRunCard: FC<CodeRunCardProps> = ({ job, children }) => (
    <Paper p="xxl" data-testid="code-run-card">
        <Stack gap="lg">
            <Title fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')} order={3}>
                <CodeRunTitle value={codeRunEndedAt(job.statusChanges)} />
            </Title>
            <Divider />
            <Stack gap="xxl">{children}</Stack>
        </Stack>
    </Paper>
)
