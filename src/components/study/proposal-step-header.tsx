import type { FC, ReactNode } from 'react'
import { Divider, Group, Paper, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'

type ProposalStepHeaderProps = {
    stepLabel: string
    heading: string
    /**
     * Omit entirely to drop the "Title:" line. Step 1 (OTTER-690) reuses this header before a
     * study exists, and its spec forbids the title as body text; every other step passes one.
     */
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

const TimestampLine: FC<{ timestampDate?: Date | string | null; timestampLabel: string }> = ({
    timestampDate,
    timestampLabel,
}) => {
    if (!timestampDate) return null

    return (
        <Text fz={12} c="charcoal.7" style={{ whiteSpace: 'nowrap' }} data-testid="proposal-timestamp">
            {timestampLabel} {dayjs(timestampDate).format('MMM DD, YYYY')}
        </Text>
    )
}

const HeaderMetaRow: FC<Pick<ProposalStepHeaderProps, 'studyTitle' | 'timestampDate'> & { timestampLabel: string }> = ({
    studyTitle,
    timestampDate,
    timestampLabel,
}) => {
    if (studyTitle == null && !timestampDate) return null

    return (
        <Group justify="space-between" align="center" wrap="nowrap">
            <StudyTitleLine studyTitle={studyTitle} />
            <TimestampLine timestampDate={timestampDate} timestampLabel={timestampLabel} />
        </Group>
    )
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
            <Title order={2} fz="xl" c="charcoal.9" pb={4}>
                {heading}
            </Title>
            <HeaderMetaRow studyTitle={studyTitle} timestampDate={timestampDate} timestampLabel={timestampLabel} />
            <Divider my={24} color="charcoal.1" data-testid="proposal-header-divider" />
            {banner}
            {children}
        </Paper>
    )
}
