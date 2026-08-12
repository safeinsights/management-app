'use client'

import { useQuery, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, type LegalDocumentTypeValue } from '@/schema/legal-document'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Stack } from '@mantine/core'
import dayjs from 'dayjs'
import { DataTable, type DataTableColumn } from 'mantine-datatable'

type Scope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

type Version = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

// signedAt is a bare YYYY-MM-DD string by design and stays that way; publishedAt is an instant, so it
// gets the app's date format.
const formatPublishedOn = (publishedAt: Version['publishedAt']) =>
    publishedAt ? dayjs(publishedAt).format('MMM DD, YYYY') : '—'

const VERSION_COLUMNS: DataTableColumn<Version>[] = [
    { accessor: 'versionNumber', title: 'Version' },
    { accessor: 'signedAt', title: 'Signed on', render: (version) => version.signedAt ?? '—' },
    { accessor: 'publishedAt', title: 'Published on', render: (version) => formatPublishedOn(version.publishedAt) },
    { accessor: 'publishedByName', title: 'Published by', render: (version) => version.publishedByName ?? '—' },
    {
        accessor: 'downloadUrl',
        title: 'Document',
        render: (version) => (
            <Anchor href={version.downloadUrl} target="_blank" rel="noreferrer">
                View
            </Anchor>
        ),
    },
]

// Fetched on open rather than with the table behind it, so a page of agreements does not pull every
// version and sign every URL up front. Scope-agnostic: the versions of an org's agreement and of a
// study's read the same.
const useVersionHistory = ({ scope, isOpen }: { scope: Scope; isOpen: boolean }) =>
    useQuery({
        queryKey: legalDocumentQueryKeys.versions(scope),
        queryFn: () => fetchLegalDocumentVersionsAction(scope),
        enabled: isOpen,
    })

export const VersionHistoryModal: FC<{
    isOpen: boolean
    onClose: () => void
    title: string
    scope: Scope
}> = ({ isOpen, onClose, title, scope }) => {
    const { data, isLoading } = useVersionHistory({ scope, isOpen })
    const published = data ? [data.current, ...data.history].filter((version) => version !== null) : []

    return (
        <AppModal isOpen={isOpen} onClose={onClose} title={title}>
            <Stack>
                <DataTable
                    horizontalSpacing="md"
                    verticalSpacing="sm"
                    fetching={isLoading}
                    idAccessor="id"
                    noRecordsText="No versions have been published yet."
                    records={published}
                    columns={VERSION_COLUMNS}
                />
            </Stack>
        </AppModal>
    )
}
