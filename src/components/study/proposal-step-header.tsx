import type { FC, ReactNode } from 'react'
import { Divider, Paper, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'

type ProposalStepHeaderProps = {
    stepLabel: string
    heading: string
    timestampDate?: Date | string | null
    timestampLabel?: string
    /** Pass `null`, not an element that renders nothing: the header cannot tell the two apart. */
    banner?: ReactNode
    children?: ReactNode
}

const HeaderTimestamp: FC<Pick<ProposalStepHeaderProps, 'timestampDate'> & { timestampLabel: string }> = ({
    timestampDate,
    timestampLabel,
}) => {
    if (!timestampDate) return null

    return (
        <Text fz={12} c="charcoal.7" ta="right" data-testid="proposal-timestamp">
            {timestampLabel} {dayjs(timestampDate).format('MMM DD, YYYY')}
        </Text>
    )
}

const HeaderDivider: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <Divider my={24} color="charcoal.1" data-testid="proposal-header-divider" />
}

export function ProposalStepHeader({
    stepLabel,
    heading,
    timestampDate,
    timestampLabel = 'Submitted on',
    banner,
    children,
}: ProposalStepHeaderProps) {
    // The rule separates the header from what follows inside the same card, so a header with
    // nothing below must not end in one (OTTER-755).
    const hasContentBelowRule = Boolean(banner) || Boolean(children)

    return (
        <Paper p="xxl" data-testid="proposal-section-header">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                {stepLabel}
            </Text>
            <Title order={2} fz="xl" c="charcoal.9" pb={4}>
                {heading}
            </Title>
            <HeaderTimestamp timestampDate={timestampDate} timestampLabel={timestampLabel} />
            <HeaderDivider isVisible={hasContentBelowRule} />
            {banner}
            {children}
        </Paper>
    )
}
