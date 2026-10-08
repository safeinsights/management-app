import { type FC } from 'react'
import { Box, Divider, Text } from '@mantine/core'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { WorkspaceFileActivitySummary } from '@/hooks/use-workspace-files'
import { studyCodeURL } from '@/lib/paths'
import { CollapseToggleLink } from './collapse-toggle-link'
import { YourFilesTable } from './your-files-table'

// Free of data fetching and the preview modal so it can render in isolation.

export type FileActivityByName = Record<string, WorkspaceFileActivitySummary>

type SubmittedFiles = LatestJobForStudy['files']

// The view-only table never fires these: star, pencil and bin are all disabled.
const noop = () => {}

const mainFileName = (files: SubmittedFiles) => files.find((file) => file.fileType === 'MAIN-CODE')?.name ?? ''

const tableFiles = (files: SubmittedFiles, activityByName: FileActivityByName) =>
    files.map((file) => ({ name: file.name, lastActivity: activityByName[file.name] ?? null }))

export interface SubmittedCodeTableViewProps {
    jobId: string
    files: SubmittedFiles
    dataPartnerName: string
    activityByName?: FileActivityByName
    onPreview: (fileName: string) => void
    maxVisibleFiles?: number
    expanded?: boolean
    onToggleExpand?: () => void
}

export const SubmittedCodeTableView: FC<SubmittedCodeTableViewProps> = ({
    jobId,
    files,
    dataPartnerName,
    activityByName = {},
    onPreview,
    maxVisibleFiles,
    expanded = false,
    onToggleExpand,
}) => {
    if (!files?.length) {
        return (
            <Text c="dimmed" size="sm">
                No code files were uploaded.
            </Text>
        )
    }

    const isTruncated = maxVisibleFiles != null && files.length > maxVisibleFiles
    const visibleFiles = isTruncated && !expanded ? files.slice(0, maxVisibleFiles) : files

    return (
        <Box data-testid="submitted-code-table">
            <YourFilesTable
                files={tableFiles(visibleFiles, activityByName)}
                mainFile={mainFileName(files)}
                dataPartnerName={dataPartnerName}
                isEditable={false}
                onView={onPreview}
                onDownload={(fileName) => window.open(studyCodeURL(jobId, fileName))}
                onSelectMain={noop}
                onEdit={noop}
                onDelete={noop}
            />
            <Divider />
            <ViewAllToggle isVisible={isTruncated} expanded={expanded} onClick={onToggleExpand} />
        </Box>
    )
}

const ViewAllToggle: FC<{ isVisible: boolean; expanded: boolean; onClick?: () => void }> = ({
    isVisible,
    expanded,
    onClick,
}) => {
    if (!onClick) return null

    return (
        <CollapseToggleLink
            label={expanded ? 'Hide code files' : 'View all code files'}
            isExpanded={expanded}
            onClick={onClick}
            isVisible={isVisible}
            mt="xs"
            testId="view-all-code-files-toggle"
        />
    )
}
