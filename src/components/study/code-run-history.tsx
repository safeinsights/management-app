'use client'

import { Collapse, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FC, useId } from 'react'
import { LocalDateTime } from '@/components/local-date-time'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'
import { fontWeight, semanticColor } from '@/theme/tokens'
import type { PriorCodeRun } from '@/server/db/queries'

const CodeRunHistoryRow: FC<{ run: PriorCodeRun }> = ({ run }) => (
    <Paper withBorder p="lg" data-testid="code-run-history-row">
        <Text fz="lg" fw={fontWeight.semibold}>
            Code run
            <LocalDateTime value={run.ranAt} prefix=" • " />
        </Text>
    </Paper>
)

// `runs` never holds the latest run, which has its own card above; with no earlier runs there is
// no history to show.
export const CodeRunHistory: FC<{ runs: PriorCodeRun[] }> = ({ runs }) => {
    const [isOpen, { toggle }] = useDisclosure(false)
    const listId = useId()

    if (runs.length === 0) return null

    return (
        <Paper withBorder p="lg" bg={semanticColor('surface.page')} data-testid="code-run-history">
            <Group justify="space-between" wrap="nowrap">
                <Title order={3} fz="md" fw={fontWeight.regular} c={semanticColor('text.secondary')}>
                    Code run history ({runs.length})
                </Title>
                <CollapseToggleLink
                    label={isOpen ? 'Hide' : 'View'}
                    isExpanded={isOpen}
                    onClick={toggle}
                    controls={listId}
                    withChevron={false}
                    size="md"
                />
            </Group>
            <Collapse in={isOpen} id={listId}>
                <Stack gap="md" pt="lg">
                    {runs.map((run) => (
                        <CodeRunHistoryRow key={run.id} run={run} />
                    ))}
                </Stack>
            </Collapse>
        </Paper>
    )
}
