'use client'

import { useState } from '@/common'
import { Anchor, Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import type { DataTableColumn } from 'mantine-datatable'

// Only the parts the participation and study-level tables genuinely share. Not a whole panel: the
// two differ in query, columns, upload form, history scope and copy, so a common component would be
// a template of holes.

type Downloadable = { downloadUrl: string }

export const documentColumn = <Row extends Downloadable>(): DataTableColumn<Row> => ({
    accessor: 'downloadUrl',
    title: 'Agreement',
    render: (row) => (
        <Anchor href={row.downloadUrl} target="_blank" rel="noreferrer">
            View PDF
        </Anchor>
    ),
})

export const versionHistoryColumn = <Row,>(onViewHistory: (row: Row) => void): DataTableColumn<Row> => ({
    accessor: 'history',
    title: 'History',
    render: (row) => (
        <Anchor component="button" type="button" onClick={() => onViewHistory(row)}>
            Version History
        </Anchor>
    ),
})

export const newVersionColumn = <Row,>(onNewVersion: (row: Row) => void): DataTableColumn<Row> => ({
    accessor: 'actions',
    title: '',
    render: (row) => (
        <Button variant="subtle" size="compact-sm" onClick={() => onNewVersion(row)}>
            Upload new version
        </Button>
    ),
})

// The row-scoped modals carry the row itself, so the form and the history modal need no
// placeholder defaults.
export const useAgreementPanelModals = <Row,>() => {
    const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false)
    const [newVersionFor, setNewVersionFor] = useState<Row | null>(null)
    const [historyFor, setHistoryFor] = useState<Row | null>(null)

    return {
        uploadOpened,
        openUpload,
        closeUpload,
        newVersionFor,
        openNewVersion: setNewVersionFor,
        closeNewVersion: () => setNewVersionFor(null),
        historyFor,
        openHistory: setHistoryFor,
        closeHistory: () => setHistoryFor(null),
    }
}
