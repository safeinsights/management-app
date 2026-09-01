'use client'

import { FC } from 'react'
import { Button, Divider, Group, Paper, Stack, Table, Text } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { OutputsFileRow, type OutputFileRowData } from './outputs-file-row'

// With one file the row's own download icon already does the job.
const DOWNLOAD_ALL_MIN_FILES = 2

type DownloadAllButtonProps = {
    isVisible: boolean
    isPreparing: boolean
    onClick: () => void
}

const DownloadAllButton: FC<DownloadAllButtonProps> = ({ isVisible, isPreparing, onClick }) => {
    // Null rather than CSS-hidden, so the button leaves the tab order entirely.
    if (!isVisible) return null

    return (
        <Button
            variant="outline"
            onClick={onClick}
            loading={isPreparing}
            // Decorative: the button already has a visible label, unlike the per-row icon.
            rightSection={<DownloadSimpleIcon size={16} aria-hidden="true" />}
            data-testid="outputs-download-all"
        >
            Download all
        </Button>
    )
}

type OutputsFilesSectionProps = {
    rows: OutputFileRowData[]
    isPreparingZip: boolean
    onView: (row: OutputFileRowData) => void
    onDownload: (row: OutputFileRowData) => void
    onDownloadAll: () => void
}

export const OutputsFilesSection: FC<OutputsFilesSectionProps> = ({
    rows,
    isPreparingZip,
    onView,
    onDownload,
    onDownloadAll,
}) => {
    const fileRows = rows.map((row) => (
        <OutputsFileRow key={row.key} row={row} onView={onView} onDownload={onDownload} />
    ))

    return (
        <Paper p="xxl" data-testid="outputs-files-section">
            <Stack gap="lg">
                <Group justify="space-between" align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        Output files
                    </Text>
                    <DownloadAllButton
                        isVisible={rows.length >= DOWNLOAD_ALL_MIN_FILES}
                        isPreparing={isPreparingZip}
                        onClick={onDownloadAll}
                    />
                </Group>
                <Divider color="charcoal.1" />
                {/* File names, actor names and timestamps are all unbounded; without this the
                    Actions column is the first thing pushed off a narrow viewport. */}
                <Table.ScrollContainer minWidth={520}>
                    <Table verticalSpacing="md" data-testid="outputs-files-table">
                        <Table.Thead bg="grey.10">
                            <Table.Tr>
                                <Table.Th scope="col">File name</Table.Th>
                                <Table.Th scope="col">Last activity</Table.Th>
                                <Table.Th scope="col" ta="right">
                                    Actions
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>{fileRows}</Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Stack>
        </Paper>
    )
}
