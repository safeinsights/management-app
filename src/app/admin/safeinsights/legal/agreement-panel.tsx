'use client'

import { useState } from '@/common'
import { Anchor, Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import type { DataTableColumn } from 'mantine-datatable'

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
