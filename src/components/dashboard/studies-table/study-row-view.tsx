'use client'

import type { FC } from 'react'
import { Group, Stack, TableTd, TableTr, Text, Tooltip } from '@mantine/core'
import { Link } from '@/components/links'
import { formatInstant } from '@/lib/dates'
import { InfoTooltip } from '@/components/tooltip'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { semanticColor } from '@/theme/tokens'
import type { ColumnDef } from './columns'
import { DeleteDraftButton } from './delete-draft-button'
import { NOT_REVIEWED, NOT_SUBMITTED, type Attribution, type RowModel } from './row-model'
import type { ColumnId } from './sort'
import classes from './study-row-view.module.css'

type CellProps = { row: RowModel }

const Placeholder: FC<{ text: string }> = ({ text }) => (
    <Text fz="sm" c={semanticColor('text.disabled')}>
        {text}
    </Text>
)

const TitleCell: FC<CellProps> = ({ row }) => (
    <Tooltip label={row.title} events={{ hover: true, focus: true, touch: true }} multiline maw={400}>
        <Link href={row.href} className={classes.title} fz="sm" c={semanticColor('text.primary')} underline="hover">
            {row.title}
        </Link>
    </Tooltip>
)

const LastUpdatedCell: FC<CellProps> = ({ row }) => <Text fz="sm">{formatInstant(row.lastActivityAt)}</Text>

// Names truncate to one line; the tooltip carries the full name.
const NameCell: FC<{ name: string | null; placeholder?: string }> = ({ name, placeholder = '' }) =>
    name ? (
        <Tooltip label={name} events={{ hover: true, focus: true, touch: true }}>
            <Text fz="sm" truncate="end">
                {name}
            </Text>
        </Tooltip>
    ) : (
        <Placeholder text={placeholder} />
    )

// The tooltip always lists every stage, whether or not the cell is truncated.
const AttributionCell: FC<{ attribution: Attribution; placeholder: string }> = ({ attribution, placeholder }) => (
    <InfoTooltip
        label={
            <Stack gap={0}>
                {attribution.lines.map((line) => (
                    <Text key={line} fz="sm">
                        {line}
                    </Text>
                ))}
            </Stack>
        }
    >
        {attribution.name ? (
            <Text fz="sm" truncate="end">
                {attribution.name}
            </Text>
        ) : (
            <Placeholder text={placeholder} />
        )}
    </InfoTooltip>
)

const DeleteDraftCell: FC<{ isVisible: boolean } & CellProps> = ({ isVisible, row }) =>
    isVisible ? <DeleteDraftButton study={row.study} /> : null

const StatusCell: FC<CellProps> = ({ row }) => (
    <Group gap="xs" wrap="nowrap">
        <DisplayStudyStatus status={row.status} />
        <DeleteDraftCell isVisible={row.canDeleteDraft} row={row} />
    </Group>
)

const CELLS: Record<ColumnId, FC<CellProps>> = {
    title: TitleCell,
    lastUpdated: LastUpdatedCell,
    belongsTo: ({ row }) => <NameCell name={row.belongsTo} />,
    submittedTo: ({ row }) => <NameCell name={row.submittedTo} placeholder={NOT_SUBMITTED} />,
    submittedFrom: ({ row }) => <NameCell name={row.submittedFrom} />,
    submittedBy: ({ row }) => <AttributionCell attribution={row.submittedBy} placeholder={NOT_SUBMITTED} />,
    reviewedBy: ({ row }) => <AttributionCell attribution={row.reviewedBy} placeholder={NOT_REVIEWED} />,
    status: StatusCell,
}

const StudyCell: FC<{ column: ColumnId } & CellProps> = ({ column, row }) => {
    const Cell = CELLS[column]
    return (
        <TableTd>
            <Cell row={row} />
        </TableTd>
    )
}

export function StudyRowView({ row, columns }: { row: RowModel; columns: ColumnDef[] }) {
    return (
        <TableTr fz={14} className={classes.row} mod={{ highlighted: row.isHighlighted }}>
            {columns.map((column) => (
                <StudyCell key={column.id} column={column.id} row={row} />
            ))}
        </TableTr>
    )
}
