import type { FC, ReactNode } from 'react'
import { Divider, Paper, Text, Title } from '@mantine/core'

type ProposalStepHeaderProps = {
    stepLabel: string
    heading: string
    studyTitle?: string | null
    timestampDate?: Date | string | null
    timestampLabel?: string
    banner?: ReactNode
    children?: ReactNode
}

const StudyTitleLine: FC<{ studyTitle?: string | null }> = ({ studyTitle }) => {
    if (studyTitle == null) return null

    return (
        <Text c="charcoal.9" style={{ maxWidth: '105ch', wordBreak: 'break-word' }}>
            Title: {studyTitle}
        </Text>
    )
}

const HeaderDivider: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <Divider my={24} color="charcoal.1" data-testid="proposal-header-divider" />
}

export function ProposalStepHeader({ stepLabel, heading, studyTitle, banner, children }: ProposalStepHeaderProps) {
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
            <StudyTitleLine studyTitle={studyTitle} />
            <HeaderDivider isVisible={hasContentBelowRule} />
            {banner}
            {children}
        </Paper>
    )
}
