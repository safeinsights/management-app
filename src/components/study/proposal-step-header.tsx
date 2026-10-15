import type { FC, ReactNode } from 'react'
import { Box, Divider, Group, Paper, Text, Title } from '@mantine/core'
import type { PageHeaderStep } from '@/components/page-header'
import { fontWeight, semanticColor } from '@/theme/tokens'

// Steps shown on more than one page. Here rather than beside the 'use client' panels that render
// them, because a server page cannot read a value exported from a client module.
export const VERIFY_OUTPUTS_STEP: PageHeaderStep = { label: 'Step 4', heading: 'Verify outputs' }
export const REVIEW_OUTPUTS_STEP: PageHeaderStep = { label: 'Step 3', heading: 'Review outputs' }
export const SUBMIT_CODE_STEP: PageHeaderStep = { label: 'Step 3', heading: 'Submit code' }
export const EDIT_CODE_STEP: PageHeaderStep = { label: 'Step 3', heading: 'Edit code' }
export const STUDY_PROPOSAL_STEP: PageHeaderStep = { label: 'Step 2', heading: 'Study proposal' }
export const EDIT_PROPOSAL_STEP: PageHeaderStep = { label: 'Step 2', heading: 'Edit proposal' }
export const SET_UP_STUDY_STEP: PageHeaderStep = { label: 'Step 1', heading: 'Set up study' }

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
                    {/* Uppercase by CSS, so screen readers read "Step 3" rather than spelling out "STEP". */}
                    <Text fz={10} fw={fontWeight.bold} c={semanticColor('text.secondary')} pb="xxs" tt="uppercase">
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
