'use client'

import { FC } from 'react'
import { ActionIcon, Table, Text, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { JobFileActivity } from '@/server/db/queries'
import { OUTPUTS_FILE_NAME_MAX_LENGTH } from '@/lib/outputs-review'
import classes from './outputs-file-row.module.css'

export type OutputFileRowData = {
    /** Stable row key: the archive row plus the inner path uniquely identifies a decrypted file. */
    key: string
    studyJobFileId: string
    filePath: string
    name: string
    contents: ArrayBuffer
    activity: JobFileActivity | null
}

export const truncateFileName = (name: string): string =>
    name.length <= OUTPUTS_FILE_NAME_MAX_LENGTH ? name : `${name.slice(0, OUTPUTS_FILE_NAME_MAX_LENGTH)}…`

const ACTION_LABEL = { VIEWED: 'Viewed', DOWNLOADED: 'Downloaded' } as const

export const formatActivityDate = (date: Date | string): string => dayjs(date).format('MMM DD, YYYY, hh:mm a')

// The middle dots are decorative. Read straight through, "Jessica Walters · Viewed · Apr 22"
// announces as one run-on phrase, so each dot is paired with hidden connective text and hidden
// from AT itself.
const LastActivityCell: FC<{ activity: JobFileActivity | null }> = ({ activity }) => {
    if (!activity) {
        return (
            <Text fz={14} c="charcoal.9">
                No activity yet
            </Text>
        )
    }

    return (
        <Text fz={14} c="charcoal.9">
            {activity.actorName}
            <VisuallyHidden>, </VisuallyHidden>
            <span aria-hidden="true"> · </span>
            {ACTION_LABEL[activity.action]}
            <VisuallyHidden> on </VisuallyHidden>
            <span aria-hidden="true"> · </span>
            {formatActivityDate(activity.createdAt)}
        </Text>
    )
}

type OutputsFileRowProps = {
    row: OutputFileRowData
    onView: (row: OutputFileRowData) => void
    onDownload: (row: OutputFileRowData) => void
}

export const OutputsFileRow: FC<OutputsFileRowProps> = ({ row, onView, onDownload }) => {
    // Only a truncated name needs an explicit accessible name; when the text is shown in full the
    // button's own content already is it, and an aria-label would just duplicate it.
    const isTruncated = row.name.length > OUTPUTS_FILE_NAME_MAX_LENGTH
    const fileNameLabel = isTruncated ? row.name : undefined

    return (
        <Table.Tr className={classes.row}>
            <Table.Td>
                {/* Tooltip on a focusable button so the full name reaches keyboard users too, not
                    just on hover. `events` adds focus; Mantine omits it by default. */}
                <Tooltip label={row.name} events={{ hover: true, focus: true, touch: true }}>
                    <UnstyledButton
                        className={classes.fileName}
                        onClick={() => onView(row)}
                        aria-label={fileNameLabel}
                        data-testid={`outputs-file-name-${row.key}`}
                    >
                        <Text component="span" fz={14} c="charcoal.9" inherit>
                            {truncateFileName(row.name)}
                        </Text>
                    </UnstyledButton>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <LastActivityCell activity={row.activity} />
            </Table.Td>
            <Table.Td ta="right">
                {/* The sole control for this row's download, so the icon carries the accessible
                    name (naming the file) rather than being hidden as decorative. */}
                <Tooltip label="Download" events={{ hover: true, focus: true, touch: true }}>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Download ${row.name}`}
                        onClick={() => onDownload(row)}
                        data-testid={`outputs-file-download-${row.key}`}
                    >
                        <DownloadSimpleIcon size={20} />
                    </ActionIcon>
                </Tooltip>
            </Table.Td>
        </Table.Tr>
    )
}
