import type { FC, ReactNode } from 'react'
import { Box, Divider, Group, Paper, Text, Title } from '@mantine/core'
import { fontWeight, semanticColor } from '@/theme/tokens'

type ProposalStepHeaderProps = {
    stepLabel: string
    heading: string
    banner?: ReactNode
    children?: ReactNode
    /** Sits opposite the heading; /resubmit puts Launch IDE there. */
    action?: ReactNode
}

const HeaderDivider: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <Divider my="lg" color={semanticColor('border.default')} data-testid="proposal-header-divider" />
}

export function ProposalStepHeader({ stepLabel, heading, banner, children, action }: ProposalStepHeaderProps) {
    // The rule separates the header from what follows inside the same card, so a header with
    // nothing below must not end in one (OTTER-755).
    const hasContentBelowRule = Boolean(banner) || Boolean(children)

    return (
        <Paper p="xxl" data-testid="proposal-section-header">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box>
                    <Text fz={10} fw={fontWeight.bold} c={semanticColor('text.secondary')} pb="xxs">
                        {stepLabel}
                    </Text>
                    <Title order={2} fz="xl" c={semanticColor('text.primary')} pb="xxs">
                        {heading}
                    </Title>
                </Box>
                {action}
            </Group>
            <HeaderDivider isVisible={hasContentBelowRule} />
            {banner}
            {children}
        </Paper>
    )
}
