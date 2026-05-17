import type { ReactNode } from 'react'
import { Divider, Group, Paper, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'

type ProposalStepHeaderProps = {
    stepLabel: string
    heading: string
    studyTitle: string
    timestampDate?: Date | string | null
    timestampLabel?: string
    banner?: ReactNode
    children?: ReactNode
}

export function ProposalStepHeader({
    stepLabel,
    heading,
    studyTitle,
    timestampDate,
    timestampLabel = 'Submitted on',
    banner,
    children,
}: ProposalStepHeaderProps) {
    return (
        <Paper p="xxl" data-testid="proposal-section-header">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                {stepLabel}
            </Text>
            <Title order={4} fz={20} c="charcoal.9" pb={4}>
                {heading}
            </Title>
            <Group justify="space-between" align="center" wrap="nowrap">
                <Text c="charcoal.9" style={{ maxWidth: '105ch', wordBreak: 'break-word' }}>
                    Title: {studyTitle}
                </Text>
                {timestampDate && (
                    <Text fz={12} c="charcoal.7" style={{ whiteSpace: 'nowrap' }} data-testid="proposal-timestamp">
                        {timestampLabel} {dayjs(timestampDate).format('MMM DD, YYYY')}
                    </Text>
                )}
            </Group>
            <Divider my="md" data-testid="proposal-header-divider" />
            {banner}
            {children}
        </Paper>
    )
}
