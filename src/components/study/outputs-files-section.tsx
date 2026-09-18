'use client'

import { FC } from 'react'
import { Button, Divider, Group, Paper, Stack, Table, Text } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { OutputsFileRow, type OutputFileRowData } from './outputs-file-row'
import classes from './outputs-files-section.module.css'
import { fontWeight, semanticColor } from '@/theme/tokens'

// With one file the row's own download icon already does the job.
const DOWNLOAD_ALL_MIN_FILES = 2

// The two pinned columns plus a readable file name, below which the container scrolls instead.
const TABLE_MIN_WIDTH = 820

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
                    <Text fz={20} fw={fontWeight.bold} c={semanticColor('text.primary')}>
                        Output files
                    </Text>
                    <DownloadAllButton
                        isVisible={rows.length >= DOWNLOAD_ALL_MIN_FILES}
                        isPreparing={isPreparingZip}
                        onClick={onDownloadAll}
                    />
                </Group>
                <Divider color={semanticColor('border.default')} />
                {/* File names, actor names and timestamps are all unbounded; without this the
                    Actions column is the first thing pushed off a narrow viewport. */}
                <Table.ScrollContainer minWidth={TABLE_MIN_WIDTH}>
                    {/* Fixed layout, because a "Last activity" cell grows from "No activity yet" to
                        an actor, an action and a timestamp the moment a file is viewed, and an
                        auto-layout table re-apportions every column when it does (OTTER-758). */}
                    <Table verticalSpacing="md" layout="fixed" w="100%" data-testid="outputs-files-table">
                        <Table.Thead bg={semanticColor('surface.page')}>
                            <Table.Tr>
                                <Table.Th scope="col">File name</Table.Th>
                                <Table.Th scope="col" className={classes.lastActivityColumn}>
                                    Last activity
                                </Table.Th>
                                <Table.Th scope="col" className={classes.actionsColumn} ta="right">
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
