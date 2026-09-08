'use client'

import { FC } from 'react'
import { ActionIcon, Table, Text, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { JobFileActivity } from '@/server/db/queries'
import { OUTPUTS_FILE_NAME_MAX_LENGTH } from '@/lib/outputs-review'
import classes from './outputs-file-row.module.css'

export type OutputFileRowData = {
    key: string
    studyJobFileId: string
    filePath: string
    name: string
    contents: ArrayBuffer
    /** False while the activity query is still in flight or has failed. */
    isActivityKnown: boolean
    activity: JobFileActivity | null
}

export const truncateFileName = (name: string): string =>
    name.length <= OUTPUTS_FILE_NAME_MAX_LENGTH ? name : `${name.slice(0, OUTPUTS_FILE_NAME_MAX_LENGTH)}…`

const ACTION_LABEL = { VIEWED: 'Viewed', DOWNLOADED: 'Downloaded' } as const

export const formatActivityDate = (date: Date | string): string => dayjs(date).format('MMM DD, YYYY, hh:mm a')

// The dots are hidden from AT and paired with connective text; read straight through they would
// announce as one run-on phrase.
const LastActivityCell: FC<{ activity: JobFileActivity | null; isKnown: boolean }> = ({ activity, isKnown }) => {
    // "No activity yet" is a claim, so it waits for the query rather than asserting it blind.
    if (!isKnown) return null

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
    // Only a truncated name needs an explicit accessible name; otherwise the button's own
    // content already is it.
    const isTruncated = row.name.length > OUTPUTS_FILE_NAME_MAX_LENGTH
    const fileNameLabel = isTruncated ? row.name : undefined

    return (
        <Table.Tr className={classes.row}>
            <Table.Td>
                {/* Mantine omits focus from tooltip `events` by default, which would hide the
                    full name from keyboard users. */}
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
                <LastActivityCell activity={row.activity} isKnown={row.isActivityKnown} />
            </Table.Td>
            <Table.Td ta="right">
                {/* The sole control in this cell, so the icon carries the accessible name rather
                    than being hidden as decorative. */}
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
