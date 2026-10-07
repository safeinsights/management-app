'use client'

import { type FC } from 'react'
import { Divider, Paper, Stack, Title } from '@mantine/core'
import type { LatestJobForStudy } from '@/server/db/queries'
import { useExpandable } from '@/hooks/use-expandable'
import { SubmittedCodeTable } from './submitted-code-table'
import { semanticColor } from '@/theme/tokens'

const SECTION_TITLE = 'Code files'

const MAX_VISIBLE_FILES = 1

interface SubmittedCodeFilesSectionProps {
    studyId: string
    jobId: string
    /** Already filtered and ordered by filterAndOrderCodeFiles. */
    files: LatestJobForStudy['files']
    dataPartnerName: string
}

export const SubmittedCodeFilesSection: FC<SubmittedCodeFilesSectionProps> = ({
    studyId,
    jobId,
    files,
    dataPartnerName,
}) => {
    const { expanded, toggle } = useExpandable()

    return (
        <Paper p="xxl" data-testid="submitted-code-files-section">
            <Stack gap="md">
                <Title order={3} fz="lg" c={semanticColor('text.primary')}>
                    {SECTION_TITLE}
                </Title>
                <Divider color={semanticColor('border.default')} />
                <SubmittedCodeTable
                    studyId={studyId}
                    jobId={jobId}
                    files={files}
                    dataPartnerName={dataPartnerName}
                    maxVisibleFiles={MAX_VISIBLE_FILES}
                    expanded={expanded}
                    onToggleExpand={toggle}
                />
            </Stack>
        </Paper>
    )
}
